# ADR-0004: Provider-independent external boundaries

- Status: accepted
- Date: 2026-09-25

## Context

Source discovery, retrieval, OCR, AI extraction and notifications need external providers. Choosing a provider with cost, privacy or lock-in consequences is an approval gate.

## Decision

Each capability is an interface in `src/providers/<capability>`. Mock implementations are named `Mock*`, registered only via explicit configuration, and never reported as real integrations. Real providers are chosen per the MASTER_EXECUTION "External providers" procedure and approved by the user.

## Consequences

Development and tests proceed with labeled mocks. Real-integration tasks may stop at a provider approval gate.
