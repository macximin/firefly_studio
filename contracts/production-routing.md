# Production routing contract

## Purpose

Firefly Studio routes advisory signals into production decisions. It does not
merge all repositories into one authority or let an advisory edge write into a
production project.

## Route

### 1. Market Radar

`firefly_market_radar` may provide dated public signals:

- ranking and release snapshots
- public title, logline, genre, tag, and display metrics
- reviewed deltas and bounded market briefs

It may not provide source prose, structural Gold judgment, pitches, or production
orders. A baseline snapshot is evidence, not a market conclusion.

### 2. Reference Lab

`firefly_reference_lab` may provide:

- project pitches and work introductions
- character-core and character-utility observations
- event, reward, relationship, pacing, and Arc references
- Gold cards and bounded routing recommendations
- owner-authorized source prose and style examples as private, SHA-bound inputs

A reference is evidence for a creative decision. The tracked handoff keeps
derived analysis, routing intent, source identifiers, ranges, and hashes. Source
bytes stay in declared private inputs and are not copied into a WorkOrder,
RunReceipt, or tracked HQ artifact.

InkOS may give the Writer the actual private story and style examples. Selected
event order, role structure, payoff rhythm, and surface texture may be used on
purpose; distance from the reference is not a quality score. A source-specific
name, fact, or expression does not become current Book canon merely because it
was present in the input. The Book contract and its reference transformation map
remain authoritative, and final surface adoption stays behind human review.

### 3. InkOS

InkOS receives a Book premise plus owner-selected market signals, tracked
reference packs, and their SHA-bound private source inputs. It owns:

- project and series contracts
- active Arc and A/B Rail truth
- chapter packets, manuscript state, review, and revision
- continuation and runtime receipts

InkOS never writes back into Market Radar or Reference Lab and never silently
promotes either edge's output.

Private fictional production is content-neutral. Crime, violence, coercion,
betrayal, exploitation, prejudice, corrupt institutions, and unjust outcomes are
not creative defects merely because they are immoral or unlawful. InkOS does not
add or remove condemnation, apology, punishment, rehabilitation, balance, or a
safer alternative solely to make the work more morally acceptable. Those beats
remain valid when they follow established character desire and scene causality,
or when the Book or owner asks for them. Emotional coherence means character and
scene causality, not moral approval. The owner controls intensity; without a new
direction, InkOS preserves the Book, reference, and established tone instead of
silently softening or escalating it.

A prohibition, required cost, redemption beat, or character reform proposed by
an agent is advisory until the owner adopts it. It may not be persisted as an
owner hard rule, fail creative review, or trigger automatic revision without
rule provenance and explicit strength.

This fictional-content rule does not change repository authorization, private
source access, personal-data handling, canon ownership, or real-world execution
boundaries. Publisher or platform compatibility is a separate, owner-selected
preflight. Its findings cannot change creative pass, commercial scores, canon,
or prose automatically.

InkOS enforces this invariant through typed Book-rule provenance, creative-review
and publication-compatibility separation, content-neutral genre defaults, and
end-to-end receipt tests. Runtime implementation status and residual risks remain
owned and versioned in the InkOS repository rather than duplicated in this HQ
boundary contract.

## Owner gate

Only the owner combines the two advisory lanes into a production direction:

```text
dated market signal + selected reference pack/private evidence + Book premise
  -> owner decision -> InkOS project
```

No score, ranking, Gold label, or automated router replaces that decision.
