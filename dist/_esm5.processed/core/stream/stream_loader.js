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
import { EMPTY, merge as observableMerge, of as observableOf, Subject, } from "rxjs";
import { finalize, ignoreElements, map, mergeMap, takeUntil, } from "rxjs/operators";
import { MediaError } from "../../errors";
import PeriodBufferManager from "../buffer";
import SourceBufferManager from "../source_buffers";
import createBufferClock from "./create_buffer_clock";
import { setDurationToMediaSource } from "./create_media_source";
import { maintainEndOfStream } from "./end_of_stream";
import EVENTS from "./events_generators";
import seekAndLoadOnMediaEvents from "./initial_seek_and_play";
import onLiveBufferEvent from "./on_live_buffer_event";
import SpeedManager from "./speed_manager";
import StallingManager from "./stalling_manager";
/**
 * Returns a function allowing to load or reload the content in arguments into
 * a single or multiple MediaSources.
 * @param {Object} loadStreamArguments
 * @returns {Observable}
 */
export default function StreamLoader(_a) {
    var mediaElement = _a.mediaElement, manifest = _a.manifest, clock$ = _a.clock$, speed$ = _a.speed$, bufferOptions = _a.bufferOptions, abrManager = _a.abrManager, segmentPipelinesManager = _a.segmentPipelinesManager, refreshManifest = _a.refreshManifest;
    /**
     * Load the content on the given MediaSource.
     * @param {MediaSource} mediaSource
     * @param {number} initialTime
     * @param {boolean} autoPlay
     */
    return function loadStreamOnMediaSource(mediaSource, initialTime, autoPlay) {
        setDurationToMediaSource(mediaSource, manifest.getDuration());
        var initialPeriod = manifest.getPeriodForTime(initialTime);
        if (initialPeriod == null) {
            throw new MediaError("MEDIA_STARTING_TIME_NOT_FOUND", null, true);
        }
        // Creates SourceBufferManager allowing to create and keep track of a single
        // SourceBuffer per type.
        var sourceBufferManager = new SourceBufferManager(mediaElement, mediaSource);
        // Initialize all native source buffers from the first period at the same
        // time.
        // We cannot lazily create native sourcebuffers since the spec does not
        // allow adding them during playback.
        //
        // From https://w3c.github.io/media-source/#methods
        //    For example, a user agent may throw a QuotaExceededError
        //    exception if the media element has reached the HAVE_METADATA
        //    readyState. This can occur if the user agent's media engine
        //    does not support adding more tracks during playback.
        createNativeSourceBuffersForPeriod(sourceBufferManager, initialPeriod);
        var _a = seekAndLoadOnMediaEvents(mediaElement, initialTime, autoPlay), seek$ = _a.seek$, load$ = _a.load$;
        var bufferClock$ = createBufferClock(manifest, clock$, seek$, speed$, initialTime);
        // Will be used to cancel any endOfStream tries when the contents resume
        var cancelEndOfStream$ = new Subject();
        // Will be used to process the events of the buffer
        var onBufferEvent = manifest.isLive ?
            onLiveBufferEvent(mediaElement, manifest, refreshManifest) :
            /* tslint:disable no-unnecessary-callback-wrapper */ // needed for TS :/
            function (evt) { return observableOf(evt); };
        /* tslint:enable no-unnecessary-callback-wrapper */
        // Creates Observable which will manage every Buffer for the given Content.
        var buffers$ = PeriodBufferManager({ manifest: manifest, initialPeriod: initialPeriod }, bufferClock$, abrManager, sourceBufferManager, segmentPipelinesManager, bufferOptions).pipe(mergeMap(function (evt) {
            switch (evt.type) {
                case "end-of-stream":
                    return maintainEndOfStream(mediaSource)
                        .pipe(ignoreElements(), takeUntil(cancelEndOfStream$));
                case "resume-stream":
                    cancelEndOfStream$.next(null);
                    return EMPTY;
                default:
                    return onBufferEvent(evt);
            }
        }));
        // Create Speed Manager, an observable which will set the speed set by the
        // user on the media element while pausing a little longer while the buffer
        // is stalled.
        var speedManager$ = SpeedManager(mediaElement, speed$, clock$, {
            pauseWhenStalled: true,
        }).pipe(map(EVENTS.speedChanged));
        // Create Stalling Manager, an observable which will try to get out of
        // various infinite stalling issues
        var stallingManager$ = StallingManager(mediaElement, clock$)
            .pipe(map(EVENTS.stalled));
        var loadedEvent$ = load$
            .pipe(mergeMap(function (evt) {
            if (evt === "autoplay-blocked") {
                var error = new MediaError("MEDIA_ERR_BLOCKED_AUTOPLAY", null, false);
                return observableOf(EVENTS.warning(error), EVENTS.loaded());
            }
            return observableOf(EVENTS.loaded());
        }));
        return observableMerge(loadedEvent$, buffers$, speedManager$, stallingManager$).pipe(finalize(function () {
            // clean-up every created SourceBuffers
            sourceBufferManager.disposeAll();
        }));
    };
    /**
     * Create all native SourceBuffers needed for a given Period.
     *
     * Native Buffers have the particulary to need to be created at the beginning of
     * the content.
     * Custom source buffers (entirely managed in JS) can generally be created and
     * disposed at will during the lifecycle of the content.
     * @param {SourceBufferManager} sourceBufferManager
     * @param {Period} period
     */
    function createNativeSourceBuffersForPeriod(sourceBufferManager, period) {
        Object.keys(period.adaptations).forEach(function (bufferType) {
            if (SourceBufferManager.isNative(bufferType)) {
                var adaptations = period.adaptations[bufferType] || [];
                var representations = adaptations ?
                    adaptations[0].representations : [];
                if (representations.length) {
                    var codec = representations[0].getMimeTypeString();
                    sourceBufferManager.createSourceBuffer(bufferType, codec);
                }
            }
        });
    }
}
