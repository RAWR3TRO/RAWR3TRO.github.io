import { addPropertyControls, ControlType } from "framer"
import type { CSSProperties } from "react"

/**
 * RAW.RETRO — full-bleed embed for Framer.
 *
 * Framer's stock Embed component does not let you set the iframe's `allow`
 * attribute, and a cross-origin iframe WITHOUT `allow="autoplay"` can never
 * start audio. The site handles that refusal gracefully — it rolls the track
 * muted so it buffers and unmutes on the first gesture — but it would then be
 * silent on arrival for every visitor, forever. That is the whole reason this
 * component exists rather than using Embed.
 *
 * Put nothing above or below this on the page. The site scrolls internally
 * (four sections at 100svh), so a scrolling Framer page around it gives you two
 * competing scroll containers. Overlay any nav on top instead.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 1440
 * @framerIntrinsicHeight 900
 */
export default function RawRetroEmbed(props: {
    url?: string
    allowAudio?: boolean
    title?: string
    style?: CSSProperties
}) {
    const {
        url = "https://rawretro.pages.dev/",
        allowAudio = true,
        title = "RAW.RETRO",
        style,
    } = props

    // `fullscreen` is harmless and lets the PSP go fullscreen if that is ever
    // added; `autoplay` is the load-bearing one.
    const allow = [allowAudio && "autoplay", "fullscreen"]
        .filter(Boolean)
        .join("; ")

    if (!url) {
        return (
            <div style={{ ...placeholder, ...style }}>
                Set the URL in the properties panel
            </div>
        )
    }

    return (
        <iframe
            src={url}
            title={title}
            allow={allow}
            loading="eager"
            referrerPolicy="no-referrer-when-downgrade"
            style={{
                display: "block",
                width: "100%",
                height: "100%",
                border: 0,
                // the site paints its own black; this only stops a white flash
                // between the iframe being laid out and the document painting
                background: "#000",
                ...style,
            }}
        />
    )
}

const placeholder: CSSProperties = {
    display: "grid",
    placeItems: "center",
    width: "100%",
    height: "100%",
    background: "#000",
    color: "#888",
    font: "13px ui-monospace, monospace",
    letterSpacing: "0.08em",
    textAlign: "center",
    padding: 24,
}

addPropertyControls(RawRetroEmbed, {
    url: {
        type: ControlType.String,
        title: "URL",
        defaultValue: "https://rawretro.pages.dev/",
        placeholder: "https://…",
    },
    allowAudio: {
        type: ControlType.Boolean,
        title: "Audio",
        defaultValue: true,
        enabledTitle: "Allow",
        disabledTitle: "Block",
    },
    title: {
        type: ControlType.String,
        title: "A11y title",
        defaultValue: "RAW.RETRO",
    },
})
