/**
 * Worker-preview bootstrap: the one module preview.html adds ahead of the
 * stock entry tag. The runtime's optional source stage owns the pre-Cordis
 * chooser; the unchanged Host connector then owns the Worker handshake.
 * Everything after those calls is the served startup chain verbatim.
 */
import MmpWorker from '@mammoth-ai/mmp-experimental-webworker-runtime/worker?worker'
import {
  chooseWorkerHostSource, connectWorkerHost, IMAGE_FILE_NAME,
} from '@mammoth-ai/mmp-experimental-webworker-runtime/client'

const image = `preview/${IMAGE_FILE_NAME}`
const source = await chooseWorkerHostSource({ image })
await connectWorkerHost(new MmpWorker({ name: 'mmp-host' }), { image, overlays: source.overlays })
