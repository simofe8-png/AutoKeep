# ADR-0003: Provenance and verification are first-class

- Status: accepted
- Date: 2026-09-25

## Context

AutoKeep must never fabricate maintenance facts. AI is not authoritative. Evidence is.

## Decision

Significant facts carry a SourceReference (source, page/section/table, version/date) and a VerificationRecord (verified / pending / unable_to_verify, plus internal conflicting/unverified). One shared UI component set renders these states. The maintenance engine consumes only verified schedule data. Without it, the engine reports the schedule as unavailable.

## Consequences

Extra storage and joins per fact, and one uncertainty vocabulary across all screens.
