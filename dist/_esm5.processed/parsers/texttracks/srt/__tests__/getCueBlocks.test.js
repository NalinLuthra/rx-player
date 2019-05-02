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
import { expect } from "chai";
import getCueBlocks from "../getCueBlocks";
var srt1 = [
    "112",
    "00:17:31.080 --> 00:17:32.200",
    "Je suis le petit chevalier",
    "Avec le ciel dessus mes yeux",
    "Je ne peux pas me effroyer",
    "",
    "",
    "00:17:55.520 --> 00:17:57.640",
    "Je suis le petit chevalier",
    "",
    "00:18:01.520 --> 00:18:09.640",
    "",
    "Avec la terre dessous mes pieds",
    "",
    "112",
    "00:18:31.080 --> 00:18:32.200",
    "",
    "112",
    "00:18:51.080 --> 00:18:52.200",
    "J'irai te visiter",
    "J'irai te visiter",
    "",
];
var srt2 = [
    "112",
    "00:17:31.080 --> 00:17:32.200",
    "Ce que j'ai fais, ce soir la",
    "Ce qu'elle a dit, ce soir la",
    "",
    "",
    "",
    "Realisant mon espoir",
    "",
    "",
    "",
    "Je me lance, vers la gloire, OK",
];
var srt3 = [
    "",
    "",
    "1",
    "00:17:31.080 --> 00:17:32.200",
    "Je n'ai plus peur de perdre mon temps",
    "",
    "00:18:51.080 --> 00:18:52.200",
    "Je n'ai plus peur de perdre mes dents",
];
describe("parsers - srt - getCueBlocks", function () {
    it("should return only timed cue blocks from a srt", function () {
        expect(getCueBlocks(srt1)).to.eql([
            [
                "112",
                "00:17:31.080 --> 00:17:32.200",
                "Je suis le petit chevalier",
                "Avec le ciel dessus mes yeux",
                "Je ne peux pas me effroyer",
            ],
            [
                "00:17:55.520 --> 00:17:57.640",
                "Je suis le petit chevalier",
            ],
            [
                "00:18:01.520 --> 00:18:09.640",
            ],
            [
                "112",
                "00:18:31.080 --> 00:18:32.200",
            ],
            [
                "112",
                "00:18:51.080 --> 00:18:52.200",
                "J'irai te visiter",
                "J'irai te visiter",
            ],
        ]);
        expect(getCueBlocks(srt2)).to.eql([
            [
                "112",
                "00:17:31.080 --> 00:17:32.200",
                "Ce que j'ai fais, ce soir la",
                "Ce qu'elle a dit, ce soir la",
            ],
        ]);
        expect(getCueBlocks(srt3)).to.eql([
            [
                "1",
                "00:17:31.080 --> 00:17:32.200",
                "Je n'ai plus peur de perdre mon temps",
            ],
            [
                "00:18:51.080 --> 00:18:52.200",
                "Je n'ai plus peur de perdre mes dents",
            ],
        ]);
    });
});
