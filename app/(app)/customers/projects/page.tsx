export const metadata = { title: 'Projects · SkyJet' };

export default function ProjectsPage() {
  return (
    <div className="hub-projects">
      <div className="hub-projects__empty">
        <ProjectsArt />
        <h1>See all the pieces fit together</h1>
        <p>
          Get a better picture of your project when you tag transactions to that project and run
          related reports. Job costing and project tracking are not in this version — use an
          estimate for the quote, then an invoice when the work is billed.
        </p>
        <button
          type="button"
          className="button button--primary"
          disabled
          title="Projects are not in this version"
        >
          Add your first project
        </button>
      </div>
    </div>
  );
}

function ProjectsArt() {
  return (
    <svg width="140" height="88" viewBox="0 0 140 88" fill="none" aria-hidden="true">
      <path
        d="M28 28h28v12h12v28H28V28Z"
        fill="var(--brand-tint)"
        stroke="var(--brand)"
        strokeWidth="1.6"
      />
      <path
        d="M72 28h28v12h12v28H84V52H72V28Z"
        fill="var(--surface)"
        stroke="var(--line-strong)"
        strokeWidth="1.6"
      />
      <path
        d="M28 72h28v-8h12v-12"
        stroke="var(--line-strong)"
        strokeWidth="1.6"
        strokeDasharray="4 5"
      />
      <rect
        x="96"
        y="8"
        width="24"
        height="24"
        rx="3"
        fill="var(--brand)"
        transform="rotate(18 108 20)"
      />
    </svg>
  );
}
