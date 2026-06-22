# PaperTrail Product Doctrine

PaperTrail is a professional-grade research intelligence workspace. It is not a student guide, reading helper, abstract summarizer, or shallow paper review site.

## North Star

PaperTrail should let a researcher, professor, lab member, or advanced scholarly user understand a paper so completely from the website that opening the original paper afterward feels like confirmation rather than discovery.

The desired end state is a paper-replacement intelligence dossier:

- reconstruct the paper's full argument
- identify the research question, gap, novelty, contribution, and claims
- explain the theoretical background and assumptions
- decode notation, equations, methods, figures, tables, and evidence
- evaluate methodology, validity, limitations, and hidden assumptions
- compare the paper to relevant literature and citation context
- propose future research directions and replication/challenge paths
- support professional decisions: cite, teach, replicate, challenge, build on, monitor, or skip

## Product Language

Use professional research-software language.

Prefer:

- research intelligence
- dossier
- scholarly synthesis
- contribution analysis
- evidence audit
- methodology audit
- notation audit
- paper architecture
- research decision matrix
- research library
- workspace

Avoid:

- guide
- student guide
- beginner
- for dummies
- shallow summary
- reading helper
- pre-reading guide
- professor-level as a gimmick

## Accuracy Standard

Never pretend abstract metadata is the full paper. If the app only has OpenAlex metadata and abstracts, say the dossier is abstract/metadata-based. To reach the north star honestly, prioritize features that ingest or extract the full paper:

- PDF/full-text upload or retrieval
- section extraction
- equation and notation extraction
- figure and table understanding
- references and citation graph
- methods/results/conclusion/limitations extraction
- cross-paper comparison

When implementing generated analysis, distinguish:

- verified from full text
- inferred from abstract or metadata
- suggested as a research hypothesis

## UI/UX Direction

The product should feel like serious software for researchers, not a marketing page or student worksheet.

- First screen should communicate research intelligence, not learning support.
- Primary artifact should be a research dossier.
- Saved papers should be a research library.
- Export should produce a research dossier PDF.
- Cards should support fast scholarly triage.
- Modals/readers should feel like professional analysis surfaces.

## Dossier Structure

A strong dossier should include, when source material supports it:

- executive intelligence brief
- research question and contribution
- novelty and relation to prior work
- theoretical framework
- assumptions and definitions
- method architecture
- data/experimental/proof design
- evidence and results audit
- figures/tables interpretation
- equations and notation audit
- limitations and validity threats
- citation and influence context
- future research agenda
- research decision matrix
- citation-ready notes

## Implementation Priority

When choosing between features, prefer the path that moves PaperTrail closer to replacing the need to open the paper:

1. Full-text/PDF ingestion
2. Structured paper extraction
3. Professional dossier generation
4. Equation/figure/table understanding
5. Cross-paper and citation intelligence
6. Research library and workflow features
7. Visual polish

Do not spend effort on student-facing copy, tutorial language, or generic summaries unless it directly supports professional research intelligence.
