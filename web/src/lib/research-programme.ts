/**
 * The research programme shown on /research. Edit here when a stage moves on;
 * papers themselves are published from the studio.
 */

export const programme = {
  name: "Calibrated reliance in AI-assisted work",
  question: "How much should people check what AI tells them, and can software tell whether they did?",
  summary:
    "AI tools answer a request to polish an email the same way they answer one that informs a legal, financial or clinical decision. My research looks at the gap between the scrutiny a task deserves and the checking people visibly do, and at how to make that gap measurable without pretending to read minds.",
  instrumentPath: "/research/calibrated-reliance-instrument#instrument",
};

export type StageStatus = "Done" | "Next" | "Planned";

export interface Stage {
  status: StageStatus;
  when: string;
  title: string;
  body: string;
  href?: string;
}

export const stages: Stage[] = [
  {
    status: "Done",
    when: "October 2026",
    title: "Instrument, version 1.0",
    body: "A traceable instrument that compares warranted and applied oversight, tested against every possible task description. It runs exactly as specified, but its results depend heavily on the chosen weights and bands.",
    href: "/research/calibrated-reliance-instrument",
  },
  {
    status: "Next",
    when: "Version 1.1",
    title: "Floor rules for severe risks",
    body: "Under version 1.0, one severe consequence leaves a task at the lowest level. Version 1.1 tests minimum levels for severe harm, irreversibility and the absence of any independent way to check, with a full rerun of every test.",
  },
  {
    status: "Planned",
    when: "Expert review",
    title: "Do the factors mean the same thing to different experts?",
    body: "Specialists in law, health, finance, data protection and HR review the factor definitions. Independent raters then describe the same tasks, to test whether the factors can be applied consistently.",
  },
  {
    status: "Planned",
    when: "Participant study",
    title: "Does the gap track good decisions?",
    body: "An ethics-approved study comparing the instrument with people's first and final answers, whether those answers were right, and how good their checks were.",
  },
];

export const involvement = {
  title: "Get involved",
  lead: "The next stages need people who do this work for real.",
  asks: [
    "You work in a field where getting AI-assisted work wrong matters, and you'd review the factor definitions.",
    "Your organisation uses AI in professional work and would consider taking part in a future study.",
    "You research reliance, oversight or human-AI decision-making and want to compare notes.",
  ],
};
