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
 * Creates a new string from the given array of char codes.
 *
 * @param {Uint8Array} args
 * @returns {string}
 */
declare function stringFromCharCode(args: Uint8Array): string;
/**
 * Creates a string from the given buffer as UTF-8 encoding.
 * @param {BufferSource} [data]
 * @returns {string}
 * @throws {Error}
 * @export
 */
declare function stringFromUTF8(data?: Uint8Array | null): string;
export { stringFromCharCode, stringFromUTF8, };
