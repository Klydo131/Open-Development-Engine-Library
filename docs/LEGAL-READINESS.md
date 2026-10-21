# Deployment legal readiness

Reviewed 16 October 2026 against the primary sources below. This local alpha
has no government approval or worldwide legal clearance. This is a technical
readiness record, not an operator-specific legal opinion.

The MIT license permits reuse of this project's software under its terms. It
does not license third-party books, recordings, videos or documents, or authorize
every way of hosting, distributing or processing them. Private and public library
operators need to assess their actual service and content permissions.

## Philippines: separate responsibilities

| Authority | Relevant responsibility and applicability boundary |
| --- | --- |
| NPC | The [Data Privacy Act](https://privacy.gov.ph/data-privacy-act/) governs personal-data processing. An individual acting for personal/family/household affairs differs from an institutional or hosted operator. Review the actual controller/processor role and the [NPC registration rules](https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04.pdf) against the operator's processing, risk and systems. |
| SEC | The [DTI business-registration FAQ](https://ecommerce.dti.gov.ph/faqs/) directs corporations to SEC registration. Entity registration concerns the operator and is not a security certification of the library engine. |
| DTI | The same [official FAQ](https://ecommerce.dti.gov.ph/faqs/) addresses sole-proprietor business names and notes that additional permits may apply. Commercial service obligations depend on the actual business and activity. |
| DICT | [RA 10844](https://issuances-library.senate.gov.ph/legislative%2Bissuances/Republic%20Act%20No.%2010844) establishes ICT policy/coordination and cybersecurity/CERT responsibilities. It also updates the organizational relationship with CICC. |
| CICC | [RA 10175](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/50264) sets out cybercrime coordination, cooperation and assistance functions. These functions do not certify every application or eliminate incident-response responsibilities. |

The conclusion that these are separate responsibilities, rather than one global
software clearance, is an inference from their defined functions. The project
has not sought or obtained any such approval.

No email or account does not mean no personal data. Notes can identify the learner
or another person; learning material may also reveal education, health or beliefs.
The DPA distinguishes personal and sensitive personal information. Local-only
storage and encryption reduce some exposure but do not decide an operator's legal
role. The personal/household distinction does not automatically exempt a public
library, employer or commercial host. Whether a particular suggestion system
constitutes regulated profiling or automated decision-making needs assessment;
this record does not classify the local rule-based prompts as either.

## What remains before a hosted or institutional release

Assess the actual operator, hosting locations, intended countries, user ages,
personal-data categories, processing purpose, notices, lawful basis, retention,
deletion, access/export, incident response and any international transfers. Add
the applicable business, consumer, accessibility and copyright requirements.
Use current local advice where the deployment requires it. One country's review
cannot establish compliance in every other country.

The current sample has no remote accounts, analytics or remote AI. Choosing a
cloud adapter changes the data flow: its authentication, authorization, logging,
storage, contracts, subprocessors and deletion/backup behavior need separate
verification. Example Vercel/Supabase configuration is not evidence that a live
deployment meets those requirements.

Keep operator-specific assessments and private user/incident data outside the
publishable source tree. Publish clear software capabilities and limitations;
do not describe this alpha as "NPC approved", "legally safe everywhere" or
certified for every device. Recheck this record before publication and when
processing, hosting, target countries or relevant rules change.
