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

import pinkie from "pinkie";
import {
  combineLatest as observableCombineLatest,
  of as observableOf,
} from "rxjs";
import {
  map,
  mergeMap,
} from "rxjs/operators";
import { IMetaPlaylist } from "../../../parsers/manifest/metaplaylist";
import getManifest from "./get_manifest";

const PPromise = typeof Promise !== undefined ? Promise :
                                                pinkie;

interface IMetaplaylistContentInfos { url: string;
                                      transport: "dash" | "smooth";
                                      duration?: number; }

/**
 * From given information about wanted metaplaylist and contents,
 * get needed supplementary infos and build a standard metaplaylist.
 * @param {Array.<Object>} contentsInfos
 * @returns {Promise<Object>} - metaplaylist
 */
function createMetaplaylist(
  contentsInfos: IMetaplaylistContentInfos[]
): Promise<IMetaPlaylist> {
  const completeContentsInfos$ = contentsInfos.map((contentInfos) => {
    const { url, transport, duration } = contentInfos;
    if (duration !== undefined) {
      return observableOf({ url,
                            transport,
                            duration });
    }
    return getManifest(url, transport).pipe(
      mergeMap((manifest) => {
        if (manifest.isDynamic || manifest.isLive) {
          throw new Error("Metaplaylist maker: Can't handle dynamic manifests.");
        }
        const manifestDuration = manifest.getMaximumPosition() -
                                 manifest.getMinimumPosition();
        return observableOf({ url,
                              duration: manifestDuration,
                              transport });
      })
    );
  });

  return observableCombineLatest(completeContentsInfos$).pipe(
    map((completeContentsInfos) => {
      const contents = completeContentsInfos
        .reduce((acc: Array<{ url: string;
                              transport: "dash" | "smooth" | "metaplaylist";
                              startTime: number;
                              endTime: number; }>,
                 val) => {
          const lastElement = acc[acc.length - 1];
          const lastStart = lastElement?.endTime ?? 0;
          acc.push({ url: val.url,
                     transport: val.transport,
                     startTime: lastStart,
                     endTime: lastStart + val.duration });
          return acc;
        }, []);
    return { type: "MPL" as const,
             version: "0.1",
             dynamic: false,
             contents };
    })
  ).toPromise(PPromise);
}

export default createMetaplaylist;
