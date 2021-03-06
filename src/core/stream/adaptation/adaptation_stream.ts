/**
 * Copyright 2015 CANAL+ Group
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * This file allows to create `AdaptationStream`s.
 *
 * An `AdaptationStream` downloads and push segment for a single Adaptation
 * (e.g.  a single audio, video or text track).
 * It chooses which Representation to download mainly thanks to the
 * ABRManager, and orchestrates a RepresentationStream, which will download and
 * push segments corresponding to a chosen Representation.
 */

import {
  BehaviorSubject,
  concat as observableConcat,
  defer as observableDefer,
  EMPTY,
  merge as observableMerge,
  Observable,
  of as observableOf,
} from "rxjs";
import {
  catchError,
  distinctUntilChanged,
  exhaustMap,
  filter,
  map,
  mergeMap,
  share,
  take,
  tap,
} from "rxjs/operators";
import { formatError } from "../../../errors";
import log from "../../../log";
import Manifest, {
  Adaptation,
  Period,
  Representation,
} from "../../../manifest";
import deferSubscriptions from "../../../utils/defer_subscriptions";
import ABRManager, {
  IABREstimate,
} from "../../abr";
import { SegmentFetcherCreator } from "../../fetchers";
import { QueuedSourceBuffer } from "../../source_buffers";
import EVENTS from "../events_generators";
import RepresentationStream, {
  IRepresentationStreamClockTick,
  ITerminationOrder,
} from "../representation";
import {
  IAdaptationStreamEvent,
  IRepresentationStreamEvent,
  IStreamEventAddedSegment,
  IStreamNeedsDiscontinuitySeek,
  IStreamNeedsManifestRefresh,
  IStreamStateActive,
  IStreamStateFull,
} from "../types";
import createRepresentationEstimator from "./create_representation_estimator";

/** `Clock tick` information needed by the AdaptationStream. */
export interface IAdaptationStreamClockTick extends IRepresentationStreamClockTick {
  /**
   * For the current SourceBuffer, difference in seconds between the next position
   * where no segment data is available and the current position.
   */
  bufferGap : number;
  /** `duration` property of the HTMLMediaElement on which the content plays. */
  duration : number;
  /** If true, the player has been put on pause. */
  isPaused: boolean;
  /** Last "playback rate" asked by the user. */
  speed : number;
}

/** Arguments given when creating a new `AdaptationStream`. */
export interface IAdaptationStreamArguments<T> {
  /**
   * Module allowing to find the best Representation depending on the current
   * conditions like the current network bandwidth.
   */
  abrManager : ABRManager;
  /**
   * Regularly emit playback conditions.
   * The main AdaptationStream logic will be triggered on each `tick`.
   */
  clock$ : Observable<IAdaptationStreamClockTick>;
  /** Content you want to create this Stream for. */
  content : { manifest : Manifest;
              period : Period;
              adaptation : Adaptation; };
  /**
   * Strategy taken when the user switch manually the current Representation:
   *   - "seamless": the switch will happen smoothly, with the Representation
   *     with the new bitrate progressively being pushed alongside the old
   *     Representation.
   *   - "direct": hard switch. The Representation switch will be directly
   *     visible but may necessitate the current MediaSource to be reloaded.
   */
  options: { manualBitrateSwitchingMode : "seamless" | "direct" };
  /** SourceBuffer wrapper - needed to push media segments. */
  queuedSourceBuffer : QueuedSourceBuffer<T>;
  /** Module used to fetch the wanted media segments. */
  segmentFetcherCreator : SegmentFetcherCreator<any>;
  /**
   * "Buffer goal" wanted, or the ideal amount of time ahead of the current
   * position in the current SourceBuffer. When this amount has been reached
   * this AdaptationStream won't try to download new segments.
   */
  wantedBufferAhead$ : BehaviorSubject<number>;
}

/**
 * Create new AdaptationStream Observable, which task will be to download the
 * media data for a given Adaptation (i.e. "track").
 *
 * It will rely on the ABRManager to choose at any time the best Representation
 * for this Adaptation and then run the logic to download and push the
 * corresponding segments in the SourceBuffer.
 *
 * After being subscribed to, it will start running and will emit various events
 * to report its current status.
 *
 * @param {Object} args
 * @returns {Observable}
 */
export default function AdaptationStream<T>({
  abrManager,
  clock$,
  content,
  options,
  queuedSourceBuffer,
  segmentFetcherCreator,
  wantedBufferAhead$,
} : IAdaptationStreamArguments<T>) : Observable<IAdaptationStreamEvent<T>> {
  const directManualBitrateSwitching = options.manualBitrateSwitchingMode === "direct";
  const { manifest, period, adaptation } = content;

  /**
   * The buffer goal ratio base itself on the value given by `wantedBufferAhead`
   * to determine a more dynamic buffer goal for a given Representation.
   *
   * It can help in cases such as : the current browser has issues with
   * buffering and tells us that we should try to bufferize less data :
   * https://developers.google.com/web/updates/2017/10/quotaexceedederror
   */
  const bufferGoalRatioMap: Partial<Record<string, number>> = {};

  const { estimator$, requestFeedback$, streamFeedback$ } =
    createRepresentationEstimator(adaptation, abrManager, clock$);

  /** Allows the `RepresentationStream` to easily fetch media segments. */
  const segmentFetcher = segmentFetcherCreator.createSegmentFetcher(adaptation.type,
                                                                    requestFeedback$);

  /**
   * Emits each time an estimate is made through the `abrEstimate$` Observable,
   * starting with the last one.
   * This allows to easily rely on that value in inner Observables which might also
   * need the last already-considered value.
   */
  const lastEstimate$ = new BehaviorSubject<IABREstimate | null>(null);

  /** Emits abr estimates on Subscription. */
  const abrEstimate$ = estimator$.pipe(
    tap((estimate) => { lastEstimate$.next(estimate); }),
    deferSubscriptions(),
    share());

  /** Emit at each bitrate estimate done by the ABRManager. */
  const bitrateEstimate$ = abrEstimate$.pipe(
    filter(({ bitrate }) => bitrate != null),
    distinctUntilChanged((old, current) => old.bitrate === current.bitrate),
    map(({ bitrate }) => {
      log.debug(`Stream: new ${adaptation.type} bitrate estimate`, bitrate);
      return EVENTS.bitrateEstimationChange(adaptation.type, bitrate);
    })
  );

  /** Recursively create `RepresentationStream`s according to the last estimate. */
  const representationStreams$ = abrEstimate$
      .pipe(exhaustMap((estimate, i) : Observable<IAdaptationStreamEvent<T>> => {
        return recursivelyCreateRepresentationStreams(estimate, i === 0);
      }));

  return observableMerge(representationStreams$, bitrateEstimate$);

  /**
   * Create `RepresentationStream`s starting with the Representation indicated in
   * `fromEstimate` argument.
   * Each time a new estimate is made, this function will create a new
   * `RepresentationStream` corresponding to that new estimate.
   * @param {Object} fromEstimate - The first estimate we should start with
   * @param {boolean} isFirstEstimate - Whether this is the first time we're
   * creating a RepresentationStream in the corresponding `AdaptationStream`.
   * This is important because manual quality switches might need a full reload
   * of the MediaSource _except_ if we are talking about the first quality chosen.
   * @returns {Observable}
   */
  function recursivelyCreateRepresentationStreams(
    fromEstimate : IABREstimate,
    isFirstEstimate : boolean
  ) : Observable<IAdaptationStreamEvent<T>> {
    const { representation } = fromEstimate;

    // A manual bitrate switch might need an immediate feedback.
    // To do that properly, we need to reload the MediaSource
    if (directManualBitrateSwitching &&
        fromEstimate.manual &&
        !isFirstEstimate)
    {
      return clock$.pipe(map(t => EVENTS.needsMediaSourceReload(period, t)));
    }

    /**
     * Emit when the current RepresentationStream should be terminated to make
     * place for a new one (e.g. when switching quality).
     */
    const terminateCurrentStream$ = lastEstimate$.pipe(
      filter((newEstimate) => newEstimate === null ||
                              newEstimate.representation.id !== representation.id ||
                              (newEstimate.manual && !fromEstimate.manual)),
      take(1),
      map((newEstimate) => {
        if (newEstimate === null) {
          log.info("Stream: urgent Representation termination", adaptation.type);
          return ({ urgent: true });
        }
        if (newEstimate.urgent) {
          log.info("Stream: urgent Representation switch", adaptation.type);
          return ({ urgent: true });
        } else {
          log.info("Stream: slow Representation switch", adaptation.type);
          return ({ urgent: false });
        }
      }));

    /**
     * Bitrate higher or equal to this value should not be replaced by segments of
     * better quality.
     * undefined means everything can potentially be replaced
     */
    const knownStableBitrate$ = lastEstimate$.pipe(
      map((estimate) => estimate === null ? undefined :
                                            estimate.knownStableBitrate),
      distinctUntilChanged());

    const representationChange$ =
      observableOf(EVENTS.representationChange(adaptation.type,
                                               period,
                                               representation));

    return observableConcat(representationChange$,
                            createRepresentationStream(representation,
                                                       terminateCurrentStream$,
                                                       knownStableBitrate$))
    .pipe(
      tap((evt) : void => {
        if (evt.type === "representationChange" ||
            evt.type === "added-segment")
        {
          return streamFeedback$.next(evt);
        }
      }),
      mergeMap((evt) => {
        if (evt.type === "stream-terminating") {
          const lastEstimate = lastEstimate$.getValue();
          if (lastEstimate === null) {
            return EMPTY;
          }
          return recursivelyCreateRepresentationStreams(lastEstimate, false);
        }
        return observableOf(evt);
      }));
  }

  /**
   * Create and returns a new RepresentationStream Observable, linked to the
   * given Representation.
   * @param {Representation} representation
   * @returns {Observable}
   */
  function createRepresentationStream(
    representation : Representation,
    terminateCurrentStream$ : Observable<ITerminationOrder>,
    knownStableBitrate$ : Observable<number | undefined>
  ) : Observable<IRepresentationStreamEvent<T>> {
    return observableDefer(() => {
      const oldBufferGoalRatio = bufferGoalRatioMap[representation.id];
      const bufferGoalRatio = oldBufferGoalRatio != null ? oldBufferGoalRatio :
                                                           1;
      bufferGoalRatioMap[representation.id] = bufferGoalRatio;

      const bufferGoal$ = wantedBufferAhead$.pipe(
        map((wba) => wba * bufferGoalRatio)
      );

      log.info("Stream: changing representation", adaptation.type, representation);
      return RepresentationStream({ clock$,
                                    content: { representation,
                                               adaptation,
                                               period,
                                               manifest },
                                    queuedSourceBuffer,
                                    segmentFetcher,
                                    terminate$: terminateCurrentStream$,
                                    bufferGoal$,
                                    knownStableBitrate$ })
        .pipe(catchError((err : unknown) => {
          const formattedError = formatError(err, {
            defaultCode: "NONE",
            defaultReason: "Unknown `RepresentationStream` error",
          });
          if (formattedError.code === "BUFFER_FULL_ERROR") {
            const wantedBufferAhead = wantedBufferAhead$.getValue();
            const lastBufferGoalRatio = bufferGoalRatio;
            if (lastBufferGoalRatio <= 0.25 ||
                wantedBufferAhead * lastBufferGoalRatio <= 2)
            {
              throw formattedError;
            }
            bufferGoalRatioMap[representation.id] = lastBufferGoalRatio - 0.25;
            return createRepresentationStream(representation,
                                              terminateCurrentStream$,
                                              knownStableBitrate$);
          }
          throw formattedError;
        }));
    });
  }
}

// Re-export RepresentationStream events used by the AdaptationStream
export {
  IStreamEventAddedSegment,
  IStreamNeedsDiscontinuitySeek,
  IStreamNeedsManifestRefresh,
  IStreamStateActive,
  IStreamStateFull,
};
