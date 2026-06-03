# UBC Emerging Media Lab — project context for scoping

This note applies to the summer scoping documents in this folder. It captures **organizational defaults** so tech-stack sections can align with **existing lab capacity**, **plugins**, and **past projects** rather than starting from a generic greenfield stack.

## Organization & contacts


|          |                                                    |
| -------- | -------------------------------------------------- |
| **Lab**  | [UBC Emerging Media Lab (EML)](https://eml.ubc.ca) |
| **Site** | [eml.ubc.ca](https://eml.ubc.ca)                   |


Use this file when onboarding students or partners who need to know **where decisions come from** and **what to reuse**.

## Historical stack & reuse bias

EML’s public Git history and forks show substantial **Unity (C#)** work on interactive 3D/education projects (many repositories live under or fork from the `**[ubcemergingmedialab](https://github.com/ubcemergingmedialab)`** GitHub org). For **new VR or 3D educational builds** that are **not** driven by featured human characters, treat **Unity LTS + established lab patterns** as the **default to evaluate first**, unless a specific project needs a different platform (e.g. web-only deployment, pure geospatial ETL).

**Practical rule:** At kickoff, inventory **in-house plugins**, **template scenes**, **XR rig presets**, **build/CI notes**, and **EML fork conventions** before choosing Godot or web-only stacks. Deviations are fine when justified (accessibility, hosting policy, data pipeline fit)—document the **why** in the project README.

## Character-forward VR: Unreal Engine (default)

For projects where **credible, teaching-grade human characters** are central—e.g. **branching dialogue with a simulated patient**, **demonstrator avatars** that must read clearly at conversational distance, or other **high-fidelity performer** needs—EML standardizes on **Unreal Engine 5** and lab experience with **MetaHuman**-class pipelines (and related Unreal animation, lighting, and cinematic tooling).

**Rationale:** Unity avatar middleware (e.g. third-party runtime avatars) is optional for many titles, but **character-heavy** summer projects benefit from **Unreal + MetaHumans** where EML already has workflow experience—reducing risk versus assembling a comparable pipeline from scratch in Unity.

**Scope split:** Use **Unreal** when the scoping doc is explicitly **character-forward VR** (see `[cultural-sensitivity-vr-nursing.md](cultural-sensitivity-vr-nursing.md)`, `[vr-vestibular-canalith-repositioning.md](vr-vestibular-canalith-repositioning.md)`). Use **Unity or web 3D** for **abstract anatomy**, **atomic/materials visualizations**, **maps**, or **hands-only / prop-first** simulations unless the brief changes. **Tablet or web** conversational simulations with **optional** lightweight avatars (e.g. `[episode-medication-administration-simulation.md](episode-medication-administration-simulation.md)`) typically stay **out of Unreal** unless the brief explicitly upgrades to **headset** 3D.

## AI services: transcription and agentic workflows

The lab has access to **institutional or lab-provisioned AI services** suitable for **audio transcription** and **agentic** (tool-using, multi-step) workflows. EML has **already applied** this class of tooling to **simulated dialogue partners** in VR—notably **virtual patients** and **virtual judges**—so new projects can **reuse patterns** (prompting, safety review, latency UX, logging) instead of inventing them from zero.

**Precedent projects (public pages)**


| Project                              | Role of AI / simulation                                                                                                                                                                   | Links                                                                                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Judicial Interrogatory Simulator** | VR courtroom practice for law students; includes **Intelli-Judge**, where AI drives **judge-like questioning** tailored to the student’s arguments (alongside a “classic” scripted mode). | [EML project page](https://eml.ubc.ca/projects/judicial-interrogatory-simulator/) · [UBC Wiki documentation](https://wiki.ubc.ca/Documentation:23-3001_Judicial_Interrogatory_Simulator) |
| **Nurse Practitioner VR tool**       | OSCE-style **virtual patient** consultations using **LLMs** and **MetaHuman** avatars for more natural, context-aware exchanges than pure pop-up scripts.                                 | [EML project page](https://eml.ubc.ca/projects/nurse-practitioner-vr-tool/) · [UBC Wiki documentation](https://wiki.ubc.ca/Documentation:23-1003_Nurse_Practitioner)                     |


**Scoping implication:** Any summer project with **spoken learner input**, **debrief transcription**, or **dynamic NPC dialogue** should ask at kickoff whether to **tap the same AI + audio stack** (subject to **privacy**, **IRB**, and **terms of use** for the specific service). Document **what may be logged**, **retention**, and **human review** for high-stakes teaching content.

## Non-Unity work

Past work also includes **web** (e.g. JavaScript tooling), **Docker/Python** for data services, and **HTML** experiences. For **maps, APIs, and open data**, prefer stacks that match **institutional hosting** and any existing **EML deployment recipes** (similar in spirit to lab-shared Docker/setup repos).

## Decision checklist (copy into project README)

1. Does EML already have a **parent repo or template** for this genre (VR lab, web exhibit, Wikibase-adjacent data)?
2. Is the project **character-forward**? If yes, default to **Unreal 5** per the section above; if no, **Unity** or **web** per the brief.
3. Which **headsets / browsers / LMS constraints** does UBC IT require?
4. What **licensed plugins** or **asset pipelines** does the lab already own?
5. If choosing a new engine or framework, who **maintains** it after the summer?
6. Does the experience need **speech-to-text**, **LLM-driven characters**, or other **agentic** flows? If yes, align with lab **AI/transcription** practice and complete **privacy/IRB** review before collecting learner audio.

## Related scoping docs

- `[vr-vestibular-canalith-repositioning.md](vr-vestibular-canalith-repositioning.md)`  
- `[suction-training-simulation.md](suction-training-simulation.md)`  
- `[immersive-material-science.md](immersive-material-science.md)`  
- `[geospatial-public-land-housing.md](geospatial-public-land-housing.md)`  
- `[cultural-sensitivity-vr-nursing.md](cultural-sensitivity-vr-nursing.md)`  
- `[beaty-museum-storytelling-pathways.md](beaty-museum-storytelling-pathways.md)`  
- `[ethics-ai-engineering-education.md](ethics-ai-engineering-education.md)`  
- `[pop-pedagogies-archive-ai-assistant.md](pop-pedagogies-archive-ai-assistant.md)`  
- `[planetary-health-medical-education.md](planetary-health-medical-education.md)`  
- `[episode-medication-administration-simulation.md](episode-medication-administration-simulation.md)`

