# Published artifacts

Canonical map of what has been published for Cellular Mode v1.0.0: the software artifact, the
technical paper in two languages, and the user guide in two languages. Every record has a
**version DOI** (one specific deposit) and a **concept DOI** (all versions of that record).

## Software

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

- Version DOI: <https://doi.org/10.5281/zenodo.23240653>
- Concept DOI: <https://doi.org/10.5281/zenodo.23240652>

**Portuguese preprint** — "Cellular Mode: um método baseado em células e verificável para
engenharia de software assistida por agentes"

- Version DOI: <https://doi.org/10.5281/zenodo.23244321>
- Concept DOI: <https://doi.org/10.5281/zenodo.23244320>
- Relation: *Is variant form of* the English preprint (<https://doi.org/10.5281/zenodo.23240653>)

## User Guide

**English** — "Cellular Mode v1.0.0 — User Guide"

- Version DOI: <https://doi.org/10.5281/zenodo.23246099>
- Concept DOI: <https://doi.org/10.5281/zenodo.23246098>
- Relation: *Documents* the software (<https://doi.org/10.5281/zenodo.23239314>)

**Portuguese** — "Cellular Mode v1.0.0 — Guia do Usuário"

- Version DOI: <https://doi.org/10.5281/zenodo.23246221>
- Concept DOI: <https://doi.org/10.5281/zenodo.23246220>
- Relation: *Documents* the software (<https://doi.org/10.5281/zenodo.23239314>)
- Relation: *Is variant form of* the English guide (<https://doi.org/10.5281/zenodo.23246099>)

## Relationship map

```
Cellular Mode v1.0.0 — software (10.5281/zenodo.23239314)
├── described by  English preprint        (10.5281/zenodo.23240653)
├── described by  Portuguese preprint     (10.5281/zenodo.23244321)
├── documented by English User Guide      (10.5281/zenodo.23246099)
└── documented by Portuguese User Guide   (10.5281/zenodo.23246221)

Portuguese preprint   — is variant form of — English preprint   (10.5281/zenodo.23240653)
Portuguese User Guide — is variant form of — English User Guide (10.5281/zenodo.23246099)
```

## Software citation

Bonomo, H. A. R. (2026). Cellular Mode (Version 1.0.0) [Computer software]. Zenodo.
<https://doi.org/10.5281/zenodo.23239314>

Machine-readable metadata: `CITATION.cff` in the repository root.
