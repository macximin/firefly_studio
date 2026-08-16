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

A reference is evidence for a creative decision, not text to reproduce. Copied
event order, names, protected expression, and unsupported facts do not pass
through this boundary.

### 3. InkOS

InkOS receives an original project premise plus owner-selected market signals and
abstract references. It owns:

- project and series contracts
- active Arc and A/B Rail truth
- chapter packets, manuscript state, review, and revision
- continuation and runtime receipts

InkOS never writes back into Market Radar or Reference Lab and never silently
promotes either edge's output.

## Owner gate

Only the owner combines the two advisory lanes into a production direction:

```text
dated market signal + selected structural reference + original premise
  -> owner decision -> InkOS project
```

No score, ranking, Gold label, or automated router replaces that decision.
