/** A campaign's label on a card or product page (SHO-169). */
export const CampaignBadge = ({ label }: { readonly label: string }) => (
  <span className="inline-block rounded-full bg-brand-700 px-2 py-0.5 text-xs font-semibold text-surface">
    {label}
  </span>
);
