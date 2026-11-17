---
description: "Speech input for the web and desktop profiles; the host downloads SenseVoice on first use."
kind: "package-bundle"
---

# @mammoth-ai/mmp-experimental-voice-input-bundle

English | [中文](README.zh.md)

## Summary

This bundle composes a speech Service Definition, local SenseVoice provider, authenticated Remote and browser microphone control. The web profile selects it, and a stock desktop profile selects the same list. Other shipped profiles leave it off.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

On a stock web or desktop profile the microphone is already between the model selector and Send. The bundle sets `prepareOnStart`, so a missing local model starts downloading when the bundle activates. While that work is unfinished, the microphone shows one status line and does not open a dialog. Complete caches stay on standby until the first recording wakes the worker. If preparation has not started, clicking the microphone starts it when the Plugins page is hidden, and the activation dialog still offers Go to setup when plugin navigation is present. Go to setup opens the bundle details. Download and prepare shows disk, memory, and time estimates; the collapsed current-step summary expands to the complete step list. Downloads report actual bytes; verification and loading show elapsed time. Once ready, click the microphone between the model selector and Send, then Stop to insert a transcript. Bundle details store the recognizer and language through the Settings service. Disabling the bundle cancels active work; cached assets remain on disk.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The static `cordis.patch.yml` adds the four voice rows, selects `sensevoice-local` as the default recognizer, supplies the provider cache directory with `mmpHomePath`, and sets `prepareOnStart` so a missing cache downloads when the bundle activates. The web template selects the bundle; other shipped templates do not. Desktop copies that list and records `desktop-voice-input` when its bundle list is exactly the older pair or already matches the template. The browser contribution owns its generated Remote mount; stable API Remotes do not import experimental code.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[Voice input subsystem](../../../docs/subsystems/voice-input.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as recordings and preparation remain outside model requests; ordinary user submission owns any later text.

#### KV Cache effect

No direct effect; ordinary submission owns the message content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The initial bundle supplies one local recognizer. Additional providers register with the same service under distinct ids; cloud recognition requires an explicit new provider and credential configuration. The bundle does not add a model tool or change the agent loop.
- Installing mmp also installs `sherpa-onnx-node` and its platform-specific native runtime, including ONNX Runtime, even when this bundle is disabled. Runtime installation adds disk and download costs separate from the models downloaded by Download and prepare; the native package size varies by platform and version.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
