class TimeVidGen {
    constructor() {
        this.defaultFps = 1;
    }

    numToBuffer(num) {
        const parts = []
        while (num > 0) {
            parts.push(num & 0xff)
            num = num >> 8
        }
        return new Uint8Array(parts.reverse())
    }

    numToFixedBuffer(num, size) {
        const parts = new Uint8Array(size)
        for (let i = size - 1; i >= 0; i--) {
            parts[i] = num & 0xff
            num = num >> 8
        }
        return parts
    }

    strToBuffer(str) {
        const arr = new Uint8Array(str.length)
        for (let i = 0; i < str.length; i++) {
            arr[i] = str.charCodeAt(i)
        }
        return arr
    }

    bitsToBuffer(bits) {
        const data = []
        const pad =
            bits.length % 8 ? new Array(1 + 8 - (bits.length % 8)).join("0") : ""
        const curBits = pad + bits
        for (let i = 0; i < curBits.length; i += 8) {
            data.push(parseInt(curBits.substr(i, 8), 2))
        }
        return new Uint8Array(data)
    }

    doubleToString(num) {
        return [].slice
            .call(new Uint8Array(new Float64Array([num]).buffer), 0)
            .map(e => String.fromCharCode(e))
            .reverse()
            .join("")
    }

    toFlatArray(arr, outBuffer) {
        if (!outBuffer) {
            outBuffer = []
        }
        for (const item of arr) {
            if (typeof item === "object" && item[Symbol.iterator]) {
                toFlatArray(item, outBuffer)
            } else {
                outBuffer.push(item)
            }
        }
        return outBuffer
    }

    parseWebP(riff) {
        const VP8 = riff.RIFF[0].WEBP[0]

        // A VP8 keyframe starts with the 0x9d012a header
        const frameStart = VP8.indexOf("\x9d\x01\x2a");
        const c = []

        for (let i = 0; i < 4; i++) {
            c[i] = VP8.charCodeAt(frameStart + 3 + i)
        }

        // the code below is literally copied verbatim from the bit stream spec
        let tmp = (c[1] << 8) | c[0]
        const width = tmp & 0x3fff
        // const horizontal_scale = tmp >> 14;
        tmp = (c[3] << 8) | c[2]
        const height = tmp & 0x3fff
        // const vertical_scale = tmp >> 14;

        return {
            width,
            height,
            data: VP8,
            riff
        }
    }
    readUint32LittleEndian(buffer, offset) {
        let val = parseInt(
            buffer
                .substr(offset, 4)
                .split("")
                .map(function (i) {
                    var unpadded = i.charCodeAt(0).toString(2);
                    return new Array(8 - unpadded.length + 1).join("0") + unpadded;
                })
                .reverse() // 注意需要翻转字节序才是小端编码
                .join(""),
            2
        );
        return val;
    }
    extractBitStreamFromVp8x(buffer) {
        //console.log("VP8X buffer:", buffer);

        /*
         跳过以下VP8X头：
         32bit VP8X Chunk size
         8bit Flags: Rsv I L E X A R 
         24bit Reserved
         24bit Canvas Width Minus One
         24bit Canvas Height Minus One
        */
        let offset = 4 + 1 + 3 + 3 + 3;
        // 搜索第一个"VP8 "或"VP8L" bit stream chunk
        while (offset < buffer.length) {
            let chunkTag = buffer.substr(offset, 4);
            //console.log(`chunkTag: \"${chunkTag}\"`);
            offset += 4;
            let chunkSize = this.readUint32LittleEndian(buffer, offset);
            //console.log("chunkSize:", chunkSize);
            offset += 4;
            switch (chunkTag) {
                case "VP8 ":
                case "VP8L":
                    const size = buffer.substr(offset - 4, 4);
                    const body = buffer.substr(offset, chunkSize);
                    return size + body;
                default:
                    // 跳过不关心的数据块
                    offset += chunkSize;
                    break;
            }
        }
        console.error("VP8X format error: missing VP8/VP8L chunk.");
    }

    parseRIFF(str) {
        //console.log("binary string:", string);
        var offset = 0;
        var chunks = {};

        while (offset < str.length) {
            var id = str.substr(offset, 4);
            chunks[id] = chunks[id] || [];
            if (id == "RIFF" || id == "LIST") {
                var len = this.readUint32LittleEndian(str, offset + 4)
                var data = str.substr(offset + 4 + 4, len);
                // console.log(data);
                offset += 4 + 4 + len;
                chunks[id].push(this.parseRIFF(data));
            } else if (id == "WEBP") {
                let vpVersion = str.substr(offset + 4, 4);
                switch (vpVersion) {
                    case "VP8X":
                        chunks[id].push(this.extractBitStreamFromVp8x(str.substr(offset + 8)));
                        break;
                    case "VP8 ":
                    case "VP8L":
                        // Use (offset + 8) to skip past "VP8 " / "VP8L" field after "WEBP"
                        chunks[id].push(str.substr(offset + 8));
                        break;
                    default:
                        console.error(`not supported webp version: \"${vpVersion}\"`);
                        break;
                }
                offset = str.length;
            } else {
                // Unknown chunk type; push entire payload
                chunks[id].push(str.substr(offset + 4));
                offset = str.length;
            }
        }
        return chunks;
    }


    checkFrames(frames) {
        const width = frames[0].width
        const height = frames[0].height
        let duration = frames[0].duration

        for (let i = 1; i < frames.length; i++) {
            if (frames[i].width !== width) {
                throw new Error("Frame " + (i + 1) + " has a different width")
            }
            if (frames[i].height !== height) {
                throw new Error("Frame " + (i + 1) + " has a different height")
            }
            if (frames[i].duration < 0 || frames[i].duration > 0x7fff) {
                throw new Error(
                    "Frame " +
                    (i + 1) +
                    " has a weird duration (must be between 0 and 32767)"
                )
            }
            duration += frames[i].duration
        }

        return {
            duration,
            width,
            height
        }
    }

    getEBMLShell(info) {
        const EBML = [
            {
                id: 0x1a45dfa3, // EBML
                data: [
                    {
                        data: 1,
                        id: 0x4286 // EBMLVersion
                    },
                    {
                        data: 1,
                        id: 0x42f7 // EBMLReadVersion
                    },
                    {
                        data: 4,
                        id: 0x42f2 // EBMLMaxIDLength
                    },
                    {
                        data: 8,
                        id: 0x42f3 // EBMLMaxSizeLength
                    },
                    {
                        data: "webm",
                        id: 0x4282 // DocType
                    },
                    {
                        data: 2,
                        id: 0x4287 // DocTypeVersion
                    },
                    {
                        data: 2,
                        id: 0x4285 // DocTypeReadVersion
                    }
                ]
            },
            {
                id: 0x18538067, // Segment
                data: [
                    {
                        id: 0x1549a966, // Info
                        data: [
                            {
                                data: 1e6, // do things in millisecs (num of nanosecs for duration scale)
                                id: 0x2ad7b1 // TimecodeScale
                            },
                            {
                                data: "timev",
                                id: 0x4d80 // MuxingApp
                            },
                            {
                                data: "timevidgen",
                                id: 0x5741 // WritingApp
                            },
                            {
                                data: this.doubleToString(info.duration),
                                id: 0x4489 // Duration
                            }
                        ]
                    },
                    {
                        id: 0x1654ae6b, // Tracks
                        data: [
                            {
                                id: 0xae, // TrackEntry
                                data: [
                                    {
                                        data: 1,
                                        id: 0xd7 // TrackNumber
                                    },
                                    {
                                        data: 1,
                                        id: 0x73c5 // TrackUID
                                    },
                                    {
                                        data: 0,
                                        id: 0x9c // FlagLacing
                                    },
                                    {
                                        data: "und",
                                        id: 0x22b59c // Language
                                    },
                                    {
                                        data: "V_VP8",
                                        id: 0x86 // CodecID
                                    },
                                    {
                                        data: "VP8",
                                        id: 0x258688 // CodecName
                                    },
                                    {
                                        data: 1,
                                        id: 0x83 // TrackType
                                    },
                                    {
                                        id: 0xe0, // Video
                                        data: [
                                            {
                                                data: info.width,
                                                id: 0xb0 // PixelWidth
                                            },
                                            {
                                                data: info.height,
                                                id: 0xba // PixelHeight
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        id: 0x1c53bb6b, // Cues
                        data: [
                            // cue insertion point
                        ]
                    }

                    // cluster insertion point
                ]
            }
        ]
        return EBML
    }

    getEBMLCuePoint(clusterTimecode) {
        const cuePoint = {
            id: 0xbb, // CuePoint
            data: [
                {
                    data: Math.round(clusterTimecode),
                    id: 0xb3 // CueTime
                },
                {
                    id: 0xb7, // CueTrackPositions
                    data: [
                        {
                            data: 1,
                            id: 0xf7 // CueTrack
                        },
                        {
                            data: 0, // to be filled in when we know it
                            size: 8,
                            id: 0xf1 // CueClusterPosition
                        }
                    ]
                }
            ]
        }
        return cuePoint
    }

    generateEBML(json, outputAsArray) {
        const ebml = []

        for (const item of json) {
            if (!("id" in item)) {
                // already encoded blob or byteArray
                ebml.push(item)
                continue
            }

            let data = item.data
            if (typeof data === "object") {
                data = this.generateEBML(data, outputAsArray)
            }
            if (typeof data === "number") {
                data =
                    "size" in item ?
                        this.numToFixedBuffer(data, item.size || 0) :
                        this.bitsToBuffer(data.toString(2))
            }
            if (typeof data === "string") {
                data = this.strToBuffer(data)
            }

            // if (data.length) {
            //   const z = z
            // }

            const len = data.size || data.byteLength || data.length
            const zeroes = Math.ceil(Math.ceil(Math.log(len) / Math.log(2)) / 8)
            const sizeStr = len.toString(2)
            const padded =
                new Array(zeroes * 7 + 7 + 1 - sizeStr.length).join("0") + sizeStr
            const size = new Array(zeroes).join("0") + "1" + padded

            // i actually dont quite understand what went on up there, so I'm not really
            // going to fix this, i'm probably just going to write some hacky thing which
            // converts that string into a buffer-esque thing

            ebml.push(this.numToBuffer(item.id))
            ebml.push(this.bitsToBuffer(size))
            ebml.push(data)
        }

        // output as blob or byteArray
        if (outputAsArray) {
            // convert ebml to an array
            const buffer = toFlatArray(ebml)
            return new Uint8Array(buffer)
        } else {
            return new Blob(ebml, {
                type: "video/webm"
            })
        }
    }

    makeSimpleBlock(data) {
        let flags = 0
        if (data.keyframe) {
            flags |= 128
        }
        if (data.invisible) {
            flags |= 8
        }
        if (data.lacing) {
            flags |= data.lacing << 1
        }
        if (data.discardable) {
            flags |= 1
        }
        if (data.trackNum > 127) {
            throw new Error("TrackNumber > 127 not supported")
        }
        const out = [data.trackNum | 0x80, data.timecode >> 8, data.timecode & 0xff, flags]
            .map(e => {
                return String.fromCharCode(e)
            })
            .join("") + data.frame

        return out
    }

    toWebM(frames, outputAsArray) {
        const info = this.checkFrames(frames)

        // max duration by cluster in milliseconds
        const CLUSTER_MAX_DURATION = 30000
        const EBML = this.getEBMLShell(info)
        const segment = EBML[1]
        const cues = segment.data[2]

        // Generate clusters (max duration)
        let frameNumber = 0
        let clusterTimecode = 0

        while (frameNumber < frames.length) {
            const cuePoint = this.getEBMLCuePoint(clusterTimecode)
            cues.data.push(cuePoint)
            const clusterFrames = []
            let clusterDuration = 0

            do {
                clusterFrames.push(frames[frameNumber])
                clusterDuration += frames[frameNumber].duration
                frameNumber++
            } while (
                frameNumber < frames.length &&
                clusterDuration < CLUSTER_MAX_DURATION
            )

            let clusterCounter = 0

            const clusterDataList = clusterFrames.map(webp => {
                const block = this.makeSimpleBlock({
                    discardable: 0,
                    frame: webp.data.slice(4),
                    invisible: 0,
                    keyframe: 1,
                    lacing: 0,
                    trackNum: 1,
                    timecode: Math.round(clusterCounter)
                })
                clusterCounter += webp.duration
                return {
                    data: block,
                    id: 0xa3
                }
            })

            const cluster = {
                id: 0x1f43b675, // Cluster
                data: [
                    {
                        data: Math.round(clusterTimecode),
                        id: 0xe7 // Timecode
                    },
                    ...clusterDataList
                ]
            }

            // Add cluster to segment
            segment.data.push(cluster)
            clusterTimecode += clusterDuration
        }

        // First pass to compute cluster positions
        let position = 0

        for (let i = 0; i < segment.data.length; i++) {
            if (i >= 3) {
                cues.data[i - 3].data[1].data[1].data = position
            }
            const data = this.generateEBML([segment.data[i]], outputAsArray)
            if (typeof Blob !== "undefined" && data instanceof Blob) {
                position += data.size
            }
            if (data instanceof Uint8Array) {
                position += data.byteLength
            }
            if (i !== 2) {
                // not cues
                // Save results to avoid having to encode everything twice
                segment.data[i] = data
            }
        }

        return this.generateEBML(EBML, outputAsArray)
    }

    autoAtob(str) {
        if (typeof atob !== "undefined") {
            return atob(str)
        }
        return Buffer.from(str, "base64").toString("binary")
    }

    async fromImageArray(images, fps, outputAsArray) {
        const curOutputAsArray = typeof Blob !== 'undefined' ? outputAsArray : true;
        const curFps = fps || defaultFps;
        let parsedWebpList = images.map((image, index) => {
            try {
                var webp = this.parseWebP(this.parseRIFF(atob(image.slice(23))))
                webp.duration = 1000 / fps;
                return webp;
            } catch (error) {
                console.error(`Before toWebM Error, Image Index ${index}`);
                throw error;
            }
        });
        return this.toWebM(parsedWebpList, curOutputAsArray);
    }

    async fromImageArrayWithOptions(images, options = {}) {
        const {
            fps,
            duration,
            outputAsArray
        } = options;
        let curFps = fps || defaultFps;
        if (duration) {
            curFps = 1000 / ((duration * 1000) / images.length);
        }
        return fromImageArray(images, curFps, outputAsArray);
    }
}