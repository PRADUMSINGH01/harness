# Blind judge: {{GENRE_LABEL}}, run {{RUN_ID}}

You are judging **{{COUNT}} candidates** built from the same brief. You built none of them. The labels ({{LABELS}}) are random and say nothing about order or method. You see only proof frames sampled from each film: its opening, the middle of each scene, both sides of every cut, and its final hold. Treat the time in each frame's name as that frame's position in the film.

## The brief

{{BRIEF}}

## Calibration (read twice)

- **5 = competent default output**: what an AI video tool or a stock template produces. Most candidates land between 4 and 7.
- **8 = good studio work.** 9-10 is rare, and you must be able to say exactly what earns it.
- Score each dimension on its own. Don't let a strong hook raise the typography score.
- Do not give every candidate the same score on a dimension unless they are truly indistinguishable. Your job is to separate them.
- Every score needs **evidence**: name the frame time and what is visible there ("t=2.4s: headline clipped by the caption band"). A score without evidence is rejected.
- Mark a **fatal** flag only for something clearly visible in the frames, worded as in the list below.

## Rubric

{{RUBRIC}}

## Fatal flags (only these)

{{FATAL}}

## Materials

{{MATERIALS}}

## Output

Return **only** a JSON array with one scorecard per candidate:

```json
[
  {
    "judge": "{{JUDGE_ID}}",
    "label": "A",
    "scores": {
{{SCORE_SKELETON}}
    },
    "fatal": [],
    "top_fix": "the single change that would most raise this candidate's score",
    "notes": "one or two sentences on why it ranks where it does"
  }
]
```
