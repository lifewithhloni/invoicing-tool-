import { Checkbox, FieldGrid, Select, TextArea, TextField } from "@/components/form";
import type { SiteRow } from "@/lib/database.types";

export const siteKindLabels = {
  collection: "Collection (mine / loading weighbridge)",
  destination: "Destination (delivery weighbridge)",
} as const;

export function SiteFields({ site }: { site?: SiteRow }) {
  return (
    <>
      <FieldGrid>
        <Select
          name="kind"
          label="Type"
          defaultValue={site?.kind}
          placeholder="Choose…"
          options={Object.entries(siteKindLabels).map(([value, label]) => ({ value, label }))}
        />
        <TextField
          name="name"
          label="Name"
          defaultValue={site?.name}
          hint="For collection sites this is the description printed on invoice lines, e.g. Grootegeluk Reductant."
          required
        />
        <TextField name="location" label="Location" defaultValue={site?.location} placeholder="e.g. Lephalale" />
      </FieldGrid>
      <TextArea name="notes" label="Notes" defaultValue={site?.notes} rows={2} />
      {site && <Checkbox name="is_active" label="Active" defaultChecked={site.is_active} />}
    </>
  );
}
