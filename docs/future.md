# Future ideas

Updated 2026-10-03. This file records ideas we discussed and their open questions. Speculative items are not committed features. The first prototype stays focused on fast cloud translation of selected text. The current provider recommendation is in [translation-options.md](translation-options.md).

## Offline mode? Maybe useful, maybe unnecessary

**Status: speculative, outside the first prototype. Its usefulness is unproven. It may be dropped entirely.**

Local translation is extremely fast once ready. In the earlier short-text engine tests, Chrome's native Translator had a 3.10 ms warm median and portable Bergamot in Helium had an 11.40 ms median. Those tests used a different, shorter corpus than the realistic cloud comparison and excluded the extension UI.

The trade-offs are unresolved. Helium's native Translator did not finish initialization within 30 seconds. The tested Bergamot wrapper allocated a 522.625 MiB Wasm heap, which is allocated linear memory rather than a measurement of physical RAM. Its compressed model assets plus runtime were about 29 MB to download. Both tested local engines translated several idioms literally.

Questions before treating offline support as a feature:

- Would we actually use it enough to justify the download and maintenance?
- Is offline availability or keeping selected text on the device valuable for this use case?
- Can Helium reliably initialize a native engine for the required language pairs?
- Can a portable engine produce Ukrainian wording good enough for everyday reading, including idioms and long passages?
- What memory, battery, and startup cost is acceptable for a lightweight extension?
- Can model loading and browser worker eviction be handled without making the first translation feel slow?
- Would a small dedicated translation model be a better fit than a tiny general LLM?

See the [local engine benchmark](benchmarks/2026-10-02/report.md) for the measurements and actual translation outputs.

## Tiny open-weight LLM in the browser?

**Status: speculative implementation option for local translation. Opinion only; no browser LLM was downloaded or tested.**

Roughly 0.5 to 1 billion parameters at four bits imply about 250 to 500 MB of raw weights before runtime buffers and caches. Ukrainian quality, actual download size, and responsiveness would depend on the chosen model and implementation.

Could a model this small translate Ukrainian well enough? Would it improve on a dedicated local translation engine? Would its first-use download and startup cost fit the lightweight extension we want? Those questions remain unanswered.

See the [model research and browser-LLM opinion](benchmarks/2026-10-02/model-research.md) for the earlier discussion and sources.

## A translation popup that belongs to the page?

The prototype now samples nearby computed styles for surface and text colors, link accents, borders, corner radius, and shadow. Typography stays consistent: SF Pro / the native system font, fixed text size, and normal letter spacing. It keeps contrast readable and offers a setting to use a neutral popup instead.

The [HTML playground](../demo/test-page.html) now includes eight page styles, nested cards, faint text, gradient and translucent backgrounds, mixed scripts, long passages, tables, code, and scroll containers. The current language settings include preferred languages, a searchable full provider list, and remembered or fixed starting targets. These are implemented; offline support remains speculative.

The popup also [preserves selected paragraph, list, and table structure](formatting.md), keeping code unchanged and using the same SF Pro / system font.

Further adaptation remains an idea with open questions. Can we recognize a page's component style more reliably? What should happen over image or gradient backgrounds? Does matching an unusual visual treatment help reading, or get in the way? How well does it work with custom web components and embedded frames? The aim is a quiet translation window, with the translated text taking most of the space.
