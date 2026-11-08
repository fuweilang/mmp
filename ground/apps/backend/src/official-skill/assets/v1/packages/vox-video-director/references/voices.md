# Bailian CosyVoice roster

Vox Video Director uses `bl speech synthesize` with `cosyvoice-v3-flash`. Set the chosen
system voice in `beats.json`:

```json
"voice": {
  "voice_id": "longtian_v3",
  "language": "zh",
  "speed": 1.0,
  "instruction": "沉稳、有纪录片感，吐字清晰"
}
```

Always inspect the live roster before choosing because voices can change:

```bash
bl speech synthesize --list-voices --model cosyvoice-v3-flash
```

Useful starting points from the 1.14.3 roster:

| Voice ID | Character | Languages | Good fit |
|---|---|---|---|
| `longtian_v3` | magnetic, rational male | Chinese / English | documentary, history, tech |
| `longcheng_v3` | intelligent young male | Chinese / English | explainers, business |
| `longze_v3` | warm energetic male | Chinese / English | lifestyle, ads |
| `longxiaoxia_v3` | calm authoritative female | Chinese / English | news, documentary |
| `longxiaochun_v3` | knowledgeable positive female | Chinese / English | education, brand films |
| `longyan_v3` | warm gentle female | Chinese / English | culture, human stories |
| `loongandy_v3` | American English male | English | English documentary |
| `loongabby_v3` | American English female | English | English explainer |
| `loongeric_v3` | British English male | English | premium/editorial |
| `loongemily_v3` | British English female | English | premium/editorial |

Use one voice for the whole film. `voice.speed` maps to the CLI `--rate` flag,
and `voice.instruction` maps to `--instruction` for delivery control.

`bl speech synthesize` does not accept a raw local reference clip as a voice clone.
For a custom voice, create a CosyVoice voice in Model Studio first and put its voice
ID in `voice.voice_id`; do not set the legacy `voice.clone_ref` field with the
`bailian_cli` provider.
