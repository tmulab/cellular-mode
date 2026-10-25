# Published artifacts

Canonical map of what has been published for Cellular Mode: the software artifact, the technical
paper in two languages, and the user guide in two languages. Every record has a **version DOI** (one
specific deposit) and a **concept DOI** (all versions of that record). Each record has a 2.0 edition
that describes **2.0.0** and a 1.0 edition that keeps describing **1.0.0**; both stay citable.

## Software 2.0.0

- Name: **Cellular Mode**, version 2.0.0
- Version DOI: <https://doi.org/10.5281/zenodo.23642223>
- Concept DOI: <https://doi.org/10.5281/zenodo.23239313>
- GitHub release: <https://github.com/tmulab/cellular-mode/releases/tag/v2.0.0>
- Release commit: `0c8a90cfada0dcc08a00eb03e04f15063b3f879d`

Tag `v2.0.0` points at release commit `0c8a90c` and does not move. Later commits on `main` are
post-release documentation — for example the DOIs in this file — and are not part of the v2.0.0
software artifact. What 2.0.0 changes, and what is breaking for adopters:
[`../CHANGELOG.md`](../CHANGELOG.md).

## Software 1.0.0

- Name: **Cellular Mode**, version 1.0.0
- Version DOI: <https://doi.org/10.5281/zenodo.23239314>
- Concept DOI: <https://doi.org/10.5281/zenodo.23239313>
- GitHub release: <https://github.com/tmulab/cellular-mode/releases/tag/v1.0.0>
- Release commit: `1070dcdb3d64442593a3f7540cd5ed86d8092e54`

Tag `v1.0.0` points at release commit `1070dcd` and does not move. Later commits on `main` are
post-release documentation — for example `CITATION.cff` (`d38b036`) — and are not part of the
v1.0.0 software artifact.

## Technical paper

**English preprint** — "Cellular Mode: A Cell-Based and Verifiable Method for Agent-Assisted
Software Engineering"

- Concept DOI: <https://doi.org/10.5281/zenodo.23240652>
- Preprint v2.0 (describes 2.0.0): <https://doi.org/10.5281/zenodo.23643014>
- Preprint v1.0 (describes 1.0.0): <https://doi.org/10.5281/zenodo.23240653>
- Relations of v2.0: *Documents* the software 2.0.0; *Is supplemented by* the English guide v2.0;
  *Is original form of* the Portuguese preprint v2.0

**Portuguese preprint** — "Cellular Mode: um método baseado em células e verificável para
engenharia de software assistida por agentes"

- Concept DOI: <https://doi.org/10.5281/zenodo.23244320>
- Preprint v2.0 (describes 2.0.0): <https://doi.org/10.5281/zenodo.23643326>
- Preprint v1.0 (describes 1.0.0): <https://doi.org/10.5281/zenodo.23244321>
- Relations of v2.0: *Is variant form of* the English preprint v2.0; *Documents* the software
  2.0.0; *Is supplemented by* the Portuguese guide v2.0

## User Guide

**English** — "Cellular Mode 2.0.0 — User Guide"

- Concept DOI: <https://doi.org/10.5281/zenodo.23246098>
- User Guide v2.0 (describes 2.0.0): <https://doi.org/10.5281/zenodo.23642707>
- User Guide v1.0 (describes 1.0.0): <https://doi.org/10.5281/zenodo.23246099>
- Relations of v2.0: *Documents* the software 2.0.0; *Is original form of* the Portuguese guide v2.0

**Portuguese** — "Cellular Mode 2.0.0 — Guia do Usuário"

- Concept DOI: <https://doi.org/10.5281/zenodo.23246220>
- Guia do Usuário v2.0 (describes 2.0.0): <https://doi.org/10.5281/zenodo.23642839>
- Guia do Usuário v1.0 (describes 1.0.0): <https://doi.org/10.5281/zenodo.23246221>
- Relations of v2.0: *Documents* the software 2.0.0; *Is variant form of* the English guide v2.0

## Relationship map

```
Cellular Mode 2.0.0 — software (10.5281/zenodo.23642223)
├── documented by English preprint v2.0     (10.5281/zenodo.23643014)
├── documented by Portuguese preprint v2.0  (10.5281/zenodo.23643326)
├── documented by English User Guide v2.0   (10.5281/zenodo.23642707)
└── documented by Portuguese User Guide v2.0 (10.5281/zenodo.23642839)

Portuguese preprint v2.0   — is variant form of — English preprint v2.0   (10.5281/zenodo.23643014)
Portuguese User Guide v2.0 — is variant form of — English User Guide v2.0 (10.5281/zenodo.23642707)
English preprint v2.0      — is supplemented by — English User Guide v2.0 (10.5281/zenodo.23642707)
Portuguese preprint v2.0   — is supplemented by — Portuguese User Guide v2.0 (10.5281/zenodo.23642839)

Cellular Mode v1.0.0 — software (10.5281/zenodo.23239314)
├── described by  English preprint v1.0      (10.5281/zenodo.23240653)
├── described by  Portuguese preprint v1.0   (10.5281/zenodo.23244321)
├── documented by English User Guide v1.0    (10.5281/zenodo.23246099)
└── documented by Portuguese User Guide v1.0 (10.5281/zenodo.23246221)
```

## Software citation

Bonomo, H. A. R. (2026). Cellular Mode (Version 2.0.0) [Computer software]. Zenodo.
<https://doi.org/10.5281/zenodo.23642223>

To cite 1.0.0 specifically, use its version DOI instead:
<https://doi.org/10.5281/zenodo.23239314>. The concept DOI
<https://doi.org/10.5281/zenodo.23239313> always resolves to the newest version.

Machine-readable metadata: `CITATION.cff` in the repository root.
