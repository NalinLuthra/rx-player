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
import { Observable } from "rxjs";
import { IEMEManagerEvent } from "../core/eme";
import { IKeySystemOption } from "../core/eme/types";
import { ICustomSourceBuffer } from "../core/source_buffers/abstract_source_buffer";
import { IDirectfileEvent, IDirectFileStreamOptions } from "../core/stream/directfile";
import { ITransportFunction } from "../net/types";
import { IHTMLTextTracksParserFn, INativeTextTracksParserFn } from "../parsers/texttracks/types";
export declare type IDirectFileStream = (args: IDirectFileStreamOptions) => Observable<IDirectfileEvent>;
export declare type IEMEManager = (mediaElement: HTMLMediaElement, keySystems: IKeySystemOption[]) => Observable<IEMEManagerEvent>;
export interface INativeTextTracksBuffer {
    new (mediaElement: HTMLMediaElement, hideNativeSubtitle: boolean): ICustomSourceBuffer<unknown>;
}
export interface IHTMLTextTracksBuffer {
    new (mediaElement: HTMLMediaElement, textTrackElement: HTMLElement): ICustomSourceBuffer<unknown>;
}
interface IBifThumbnail {
    index: number;
    duration: number;
    ts: number;
    data: Uint8Array;
}
interface IImageTrackSegmentData {
    data: IBifThumbnail[];
    end: number;
    start: number;
    timescale: number;
    type: string;
}
interface IBifObject {
    fileFormat: string;
    version: string;
    imageCount: number;
    timescale: number;
    format: string;
    width: number;
    height: number;
    aspectRatio: string;
    isVod: boolean;
    thumbs: IBifThumbnail[];
}
export interface IImageBuffer {
    new (): ICustomSourceBuffer<IImageTrackSegmentData>;
}
export declare type IImageParser = ((buffer: Uint8Array) => IBifObject);
export interface IFeaturesObject {
    transports: Partial<Record<string, ITransportFunction>>;
    imageBuffer: IImageBuffer | null;
    imageParser: IImageParser | null;
    nativeTextTracksBuffer: INativeTextTracksBuffer | null;
    nativeTextTracksParsers: Partial<Record<string, INativeTextTracksParserFn>>;
    htmlTextTracksBuffer: IHTMLTextTracksBuffer | null;
    htmlTextTracksParsers: Partial<Record<string, IHTMLTextTracksParserFn>>;
    emeManager: IEMEManager | null;
    directfile: IDirectFileStream | null;
}
export declare type IFeatureFunction = (features: IFeaturesObject) => void;
export {};
