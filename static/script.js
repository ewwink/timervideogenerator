"use strict";
let canvas = document.querySelector("#canvasPreview"),
    ctx = canvas.getContext("2d"),
    timeVidGen = new TimeVidGen(),
    builtinFonts = ["Arial", "Arial Black", "Bahnschrift", "Calibri", "Comic Sans MS", "Consolas", "Franklin Gothic Medium",
        "Impact", "Ink Free", "Lucida Console", "MS Gothic", "MV Boli", "Microsoft Sans Serif", "Segoe Print", "Segoe UI",
        "Tahoma", "Times New Roman", "Trebuchet MS"],
    externalFonts = ["Abril Fatface", "Amatic SC", "Bangers", "Chewy", "Comfortaa", "Courgette",
        "Covered By Your Grace", "Dancing Script", "Danfo", "Jaini", "Josefin Sans", "Kaushan Script", "Lobster", "Montez",
        "Orbitron", "Pacifico", "Righteous", "Rokkitt", "Satisfy", "Shadows Into Light", "Sigmar One"],
    inputSelector = ["#timeType", "#timeSeconds", "#timeMinutes", "#timeHours",
        "#fontType", "#fontBold", "#fontSize",
        "#fontColor", "#backgroundColor", "#videoWidth", "#videoHeight"],
    fontTypelEl = $("#fontType"),
    previewStatus = $('#previewStatus'),
    fps = 1, framePerSecond = 0,
    videoWorker,
    options, x_axis, y_axis, previewTimeout;

// if (window.Worker) {
//     videoWorker = new Worker('static/worker.js');
// }
function getVideoDuration() {
    let duration = 0,
        seconds = parseInt($('#timeSeconds').val()),
        minutes = parseInt($('#timeMinutes').val()),
        hours = parseInt($('#timeHours').val());
    duration = seconds + (minutes * 60) + (hours * 60 * 60);
    return duration;
}

function setStatus(text) {
    previewStatus.html(text);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function setOptions(reset = false) {
    options = JSON.parse(localStorage.getItem('timevidgen')) || {};
    if (reset || !Object.keys(options).length) {
        options = {
            timeType: 'stopwatch',
            fontType: 'DigitalNumbers',
            fontBold: false,
            fontSize: 180,
            fontColor: '#ffffff',
            backgroundColor: '#000000',
            videoWidth: 800,
            videoHeight: 400
        }
        localStorage.setItem('timevidgen', JSON.stringify(options))
    }

    for (let [key, val] of Object.entries(options))
        $('#' + key).val(val);
    $('#fontBold').prop('checked', options.fontBold);
    fontTypelEl.css({ 'font-weight': options.fontBold ? 'bold' : 'inherit', 'font-family': options.fontType })
    $('#canvasPreview, #videoPreview').css({ 'width': `${options.videoWidth}px` });
    setTimeout(generatePreview, 1000);
}

async function setVideoSrc(webm) {
    let videoURL = URL.createObjectURL(webm) || null;
    $('#videoPreview').prop('src', videoURL)
}

function generateFrame(text) {
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = $('#fontColor').val();
    ctx.fillText(text, x_axis, y_axis);
    const webpUrl = canvas.toDataURL('image/webp');
    ctx.fillStyle = $('#backgroundColor').val();
    return webpUrl;
}

async function generateVideo(videoDuration, isMinutes) {
    let frames = [], webm;
    for (let i = 0; i < videoDuration + 1; i++) {
        let number = i;
        if (options.timeType == "countdown") {
            number = videoDuration - i
        }
        let timeString = new Date(number * 1000).toISOString().substring(11, 19); // 00:00:00
        if (isMinutes) {
            timeString = timeString.substring(3, 8); // 00:00
        }
        let webpUrl = generateFrame(timeString)
        frames.push(webpUrl);
    }

    if (videoWorker) {
        // videoWorker.addEventListener('message', function (e) {
        //     setVideoSrc(e.data);
        // });
        // videoWorker.postMessage([frames, fps]);
    } else {

    }
    webm = await timeVidGen.fromImageArray(frames, fps);
    setVideoSrc(webm);
}

async function generateVideoDownload() {
    let start2 = performance.now();
    $('#generateVideo').prop('disabled', true);
    setStatus("Generating Video, please wait...");
    await sleep(10)
    let videoDuration = getVideoDuration();
    let isMinutes = videoDuration < 3600;
    await generateVideo(videoDuration, isMinutes);
    let href = $('#videoPreview').prop('src'),
        filename = `${options.timeType}-${videoDuration}.webm`,
        downloadButton = `<a href="${href}" download="${filename}" id="downloadVideo"><button type="button" class="btn btn-sm btn-primary" role="button">Download</button></a>`
    $('#generateVideo').prop('disabled', false);
    let timeTaken = ((performance.now() - start2) / 1000).toFixed(1);
    setStatus(`Video Ready to ${downloadButton} | Generated in: ${timeTaken}s`);
    document.querySelector('#downloadVideo').click();
}

async function generatePreview() {
    setStatus('Generating 5 Second Preview...')
    await sleep(10)
    let start = performance.now();
    canvas.width = options.videoWidth;
    canvas.height = options.videoHeight;
    canvas.style.letterSpacing = '';
    if (options.fontType == 'DigitalNumbers') {
        canvas.style.letterSpacing = '-1em'
    }
    ctx.fillStyle = options.backgroundColor;
    let isBold = options.fontBold ? 'bold' : '';
    let fontStyle = `${isBold} ${options.fontSize}px ${options.fontType}`
    ctx.font = fontStyle;

    let text = "00:00";
    let isMinutes = true;
    if (getVideoDuration() > 3599) {
        text = "00:00:00";
        isMinutes = false;
    }
    let {
        width,
        actualBoundingBoxAscent,
        actualBoundingBoxDescent
    } = ctx.measureText(text);
    text = text.slice(0, -1)
    x_axis = (canvas.width / 2) - (width / 2);
    y_axis = canvas.height / 2 + (actualBoundingBoxAscent - actualBoundingBoxDescent) / 2;
    let duration = 5;
    await generateVideo(duration, isMinutes);
    let timeTaken = (performance.now() - start) / 1000;
    framePerSecond = timeTaken / 6
    console.log(`5 frames in: ${timeTaken.toFixed(2)}s`)
    setStatus(`5 Seconds Preview (${framePerSecond.toFixed(3)}s/frame)`);
}

$(inputSelector.join(',')).on('input', (e) => {
    if (previewTimeout)
        clearTimeout(previewTimeout)
    let obValue = e.target.value
    if (e.target.id == 'fontBold') {
        obValue = e.target.checked;
    }
    options[e.target.id] = obValue;
    localStorage.setItem('timevidgen', JSON.stringify(options))
    previewTimeout = setTimeout(generatePreview, 1000)
});

fontTypelEl.on('input', (e) => {
    fontTypelEl.css('font-family', e.target.value)
});
$("#fontBold").on('click', (e) => {
    fontTypelEl.css('font-weight', e.target.checked ? 'bold' : 'inherit')
});
$('#resetOptions').on('click', () => {
    setOptions(true);
});

$('#generateVideo').on('click', async () => {
    await generateVideoDownload();
});

$('#calculateEstimation').on('input', (e) => {
    let estimation = parseInt(e.target.value) * 60 * framePerSecond;
    let minutes = 0;

    while (estimation > 60) {
        minutes++;
        estimation -= 60;
    }
    let seconds = parseInt(estimation);
    $('#resultEstimation').val(`${minutes} Minutes ${seconds} Seconds`)
});

(async () => {
    await document.fonts.ready;
    let fontAvailable = [];
    let htmlList = '<option value="DigitalNumbers" style="font-family:DigitalNumbers;" selected>Digital Numbers-12:59</option>';
    for (const font of builtinFonts) {
        if (document.fonts.check(`12px "${font}"`)) {
            fontAvailable.push(font);
        }
    }
    let allFonts = fontAvailable.concat(externalFonts).sort();
    for (const font of allFonts) {
        htmlList += `<option value="${font}" style="font-family:${font}">${font} - 12:59</option>`
    }
    $('#fontType').html(htmlList);
    await setOptions();
})();

