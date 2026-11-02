# Radhouse Mobile

Proposed native iPhone and Android companion for the existing Radhouse assistant.
This repository is at the design stage; no runnable app or live mobile login is
implemented yet.

- [Mobile design and delivery slices](docs/mobile-design.md)
- [Quality and SonarQube workflow](docs/quality.md)
- [Radhouse engineering roadmap](https://github.com/Running-Digitally/radhouse/blob/main/ROADMAP.md)

The backend owns conversations, pending replies, files, assistant identity and
runtime operations. Mobile presents those existing contracts. It must not create
a second assistant history or replay a message just because connectivity changed.

Deployment topology, access policies, credentials and operational evidence belong
in the private operations repository. Use synthetic fixtures for development and
keep private conversations, tokens and device screenshots out of Git.
