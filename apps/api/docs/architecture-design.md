# Architecture walkthrough

Mode: Read. The owner wants an easy explanation of the implemented service,
from capabilities through storage, processing, recovery and access boundaries.

This surface inherits the API inspector's neutral canvas, green action color,
system typography, visible focus and restrained controls from `../DESIGN.md`.
It adds six guided chapters, a selectable system diagram, a technical-depth toggle,
four save scenarios and an endpoint explorer generated from OpenAPI.

All example values are illustrative. The page makes no API mutations, performs no
external fetches, requests no login and embeds no user library or credentials.
The public `/architecture` route and the standalone `architecture.html` artifact
come from the same renderer. Resource relationships and behavior come from the
blueprint, deployed configuration and actual API implementations.

Verification uses DOM execution for interaction logic, Worker HTTP delivery,
typecheck/lint/build, and direct browser interaction when the enabled surfaces
permit it. DOM checks are not visual browser verification.
