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

import { ICustomError } from "../../errors";
import Manifest, {
  Adaptation,
  Period,
  Representation,
} from "../../manifest";
import {
  ILocalIndexSegment,
  ILocalManifestInitSegmentLoader,
  ILocalManifestSegmentLoader,
} from "../../parsers/manifest/local";

/**
 * Supplementary information specific to Smooth Initialization segments.
 * Contains every information needed to generate an initialization segment.
 */
export interface ISmoothInitSegmentPrivateInfos { codecPrivateData? : string;
                                                  bitsPerSample? : number;
                                                  channels? : number;
                                                  packetSize? : number;
                                                  samplingRate? : number;
                                                  protection? : {
                                                    keyId : Uint8Array;
                                                    keySystems : Array<{
                                                      systemId : string;
                                                      privateData : Uint8Array;
                                                    }>;
                                                  }; }

/** Describes a given "real" Manifest for MetaPlaylist's segments. */
export interface IBaseContentInfos { manifest: Manifest;
                                     period: Period;
                                     adaptation: Adaptation;
                                     representation: Representation; }

/** Supplementary information needed for segments in the "metaplaylist" transport. */
export interface IMetaPlaylistPrivateInfos { transportType : string;
                                             baseContent : IBaseContentInfos;
                                             contentStart : number;
                                             contentEnd? : number; }

/**
 * Supplementary information needed for initialization segments of the "local"
 * transport.
 */
export interface ILocalManifestInitSegmentPrivateInfos {
  /** Callback used to load that segment. */
  load : ILocalManifestInitSegmentLoader;
}

/** Supplementary information needed for media segments of the "local" transport. */
export interface ILocalManifestSegmentPrivateInfos {
  /** Callback used to load that segment. */
  load : ILocalManifestSegmentLoader;

  /**
   * Exact same segment than the one given in a local manifest.
   * Stored (with at best the same reference than in it) to facilitate the job
   * of retrieving the wanted segment (this task will generally be done by the
   * content downloader tool) when the RxPlayer asks for it.
   */
  segment : ILocalIndexSegment;
}

/**
 * Supplementary information that can be added to any segment depending on the
 * tranport logic used.
 * Called "private" as it won't be read or exploited by any code in the core
 * logic of the player. That information is only here to be retrieved and
 * exploited by the corresponding transport logic.
 */
export interface IPrivateInfos {
  smoothInit? : ISmoothInitSegmentPrivateInfos;
  metaplaylistInfos? : IMetaPlaylistPrivateInfos;
  localManifestInitSegment? : ILocalManifestInitSegmentPrivateInfos;
  localManifestSegment? : ILocalManifestSegmentPrivateInfos;
}

/** Represent a single Segment from a Representation. */
export interface ISegment {
  /** Estimated duration of the segment, in timescale. */
  duration : number;
  /** ID of the Segment. Should be unique for this Representation. */
  id : string;
  /** If true, this Segment contains initialization data. */
  isInit : boolean;
  /** URLs where this segment is available. From the most to least prioritary. */
  mediaURLs : string[]|null;
  /** Estimated start time for the segment, in timescale. */
  time : number;
  /** Timescale to convert `time` and `duration` into seconds. */
  timescale : number;
  /**
   * If set, the corresponding byte-range in the downloaded segment will
   * contain an index describing other Segments
   * TODO put in privateInfos?
   */
  indexRange? : [number, number];
  /**
   * Optional number of the Segment
   * TODO put in privateInfos?
   */
  number? : number;
  /**
   * Allows to store supplementary information on a segment that can be later
   * exploited by the transport logic.
   */
  privateInfos? : IPrivateInfos;
  /** Optional byte range to retrieve the Segment from its URL(s) */
  range? : [number, number];
  /**
   * Estimated time, in seconds, at which the concerned segment should be
   * offseted when decoded.
   */
  timestampOffset? : number;
}

/**
 * Information about supplementary segment which might not yet be known to a
 * `IRepresentationIndex`.
 */
export interface ISupplementarySegmentsInfo {
  /** Estimated start time for the segment, in timescale. */
  time : number;
  /** Timescale to convert `time` and `duration` into seconds. */
  timescale : number;
  /** Estimated duration of the segment, in timescale. */
  duration : number;
  count? : number;
  /** Optional byte range to retrieve the Segment from its URL(s) */
  range? : [number, number];
}

/** Interface that should be implemented by any Representation's `index` value. */
export interface IRepresentationIndex {
  /**
   * Returns Segment object for the initialization segment, allowing to do the
   * Init Segment request.
   * @returns {Object}
   */
  getInitSegment() : ISegment|null;

  /**
   * Returns an array of Segments needed for the amount of time given.
   * @param {number} up - The first wanted position, in seconds.
   * @param {number} duration - The amount of time in seconds you want from the
   * starting position given in `up`.
   * @returns {Array.<Object>} - The list of segments corresponding to your
   * wanted range.
   */
  getSegments(up : number, duration : number) : ISegment[];

  /**
   * Returns `true` if, from the given situation, the manifest has to be
   * refreshed.
   * @param {number} up - Beginning time in seconds of the range that is
   * currently wanted.
   * @param {number} to - Ending time in seconds of the range that is
   * currently wanted.
   * @returns {Boolean}
   */
  shouldRefresh(up : number, to : number) : boolean;

  /**
   * Returns the starting time, in seconds, of the earliest segment currently
   * available in this index.
   * Returns `null` if nothing is in the index
   * Returns `undefined` if we cannot know this value.
   * @returns {Number|null}
   */
  getFirstPosition() : number | null | undefined;

  /**
   * Returns the ending time, in seconds, of the last segment currently
   * available in this index.
   * Returns `null` if nothing is in the index
   * Returns `undefined` if we cannot know this value.
   * @returns {Number|null|undefined}
   */
  getLastPosition() : number | null | undefined;

  /**
   * Returns `true` if a Segment returned by this index is still considered
   * available.
   * Returns `false` if it is not available anymore.
   * Returns `undefined` if we cannot know whether it is still available or not.
   * @param {Object} segment
   * @returns {Boolean|undefined}
   */
  isSegmentStillAvailable(segment : ISegment) : boolean | undefined;

  /**
   * Returns true if the `error` given following the request of `segment` can
   * indicate that the index became "de-synchronized" with the server.
   *
   * Reasons for de-synchronizations includes for example Manifest parsing
   * optimizations where a newer version will not be totally parsed. In those
   * conditions, we could be left with doing a segment request for a segment
   * that does not really exists.
   *
   * Note: This API assumes that the user first checked that the segment is
   * still available through `isSegmentStillAvailable`.
   * @param {Error} error
   * @param {Object} segment
   * @returns {Boolean}
   */
  canBeOutOfSyncError(error : ICustomError, segment : ISegment) : boolean;

  /**
   * Checks if the given time - in seconds - is in a discontinuity. That is:
   *
   *   - We're on the upper bound of the current range (end of the range - time
   *     is inferior to the timescale)
   *
   *   - The next range starts after the end of the current range.
   *
   * @param {Number} _time
   * @returns {Number} - If a discontinuity is present, this is the Starting
   * time for the next (discontinuited) range. If not this is equal to -1.
   */
  checkDiscontinuity(time : number) : number;

  /**
   * Returns `true` if the last segments in this index have already been
   * generated so that we can freely go to the next period.
   * Returns `false` if the index is still waiting on future segments to be
   * generated.
   * @returns {boolean}
   */
  isFinished() : boolean;

  /**
   * Returns `true` if this index has all the data it needs to give the list
   * of available segments.
   * Returns `false` if you first should load its initialization segment (or
   * the initialization segment's associated index file) to get the list of
   * available segments.
   *
   * Most index don't rely on the initialization segment to give an index and
   * as such, this method should return `true` directly.
   * However in some index, the segment lists might only be known after the
   * initialization has been loaded. In those case, it should return `false`
   * until the corresponding segment list is known (generally through the
   * `_addSegments` method), at which point it can return `true`.
   * @returns {boolean}
   */
  isInitialized() : boolean;

  /**
   * Replace the index with another one, such as after a Manifest update.
   * @param {Object} newIndex
   */
  _replace(newIndex : IRepresentationIndex) : void;

  /**
   * Update the current index with a new, partial, version.
   * @param {Object} newIndex
   */
  _update(newIndex : IRepresentationIndex) : void;

  /**
   * Add new segments to the index, obtained through various other different
   * ways.
   * @param {Array.<Object>} nextSegments
   * @param {Object} currentSegment
   */
  _addSegments(
    nextSegments : ISupplementarySegmentsInfo[],
    currentSegment? : { duration? : number;
                        time : number;
                        timescale? : number; }
  ) : void;
}
