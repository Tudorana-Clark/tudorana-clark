/**
 * Bookable keynotes. The pinned one is featured at the top of /speaking and on the home page.
 * Edit here to change the talk, its poster or where Book now leads.
 */

export interface Keynote {
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  /** Shown along the foot of the poster, in order. */
  stages: string[];
  /** What the audience sees built during the talk; the poster's blueprint card lists these. */
  deliverables: string[];
  /** The figure on the poster's clock, e.g. "30:00". */
  clock: string;
  clockCaption: string;
  /** Opening line put in the booking form's message when someone arrives from this keynote's Book now. */
  enquiry: string;
}

export const pinnedKeynote: Keynote = {
  slug: "30-minute-startup",
  title: "The 30 Minute Startup with Claude",
  subtitle: "From idea to launch in one session.",
  summary:
    "A live keynote in which Daniel takes a business idea from a blank page to a launch-ready blueprint with Claude, in front of the audience and against the clock.",
  stages: ["Idea", "Brand", "Operations", "Launch"],
  deliverables: ["Business summary", "Brand positioning", "Offer and model", "Launch plan"],
  clock: "30:00",
  clockCaption: "From idea to launch, built live with Claude",
  enquiry: "I'd like to book The 30 Minute Startup with Claude. Event, date, location and audience size:",
};

export const bookingHref = (k: Keynote) => `/speaking?keynote=${k.slug}#book`;
