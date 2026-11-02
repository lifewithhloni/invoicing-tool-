import { Checkbox, FieldGrid, Select, TextField } from "@/components/form";
import type { DriverRow, TruckRow } from "@/lib/database.types";

export function TruckFields({
  truck,
  drivers,
}: {
  truck?: TruckRow;
  drivers: Pick<DriverRow, "id" | "full_name">[];
}) {
  return (
    <>
      <FieldGrid>
        <TextField name="registration" label="Registration" defaultValue={truck?.registration} placeholder="LT48JRGP" required />
        <TextField
          name="trailer_registrations"
          label="Trailer registrations"
          defaultValue={truck?.trailer_registrations.join(", ")}
          placeholder="MJ21SWGP, MJ21SXGP"
          hint="Separate with commas."
        />
        <TextField name="description" label="Description" defaultValue={truck?.description} placeholder="e.g. 1x2x2x2 interlink" />
        <Select
          name="default_driver_id"
          label="Usual driver"
          defaultValue={truck?.default_driver_id}
          placeholder="None"
          options={drivers.map((d) => ({ value: d.id, label: d.full_name }))}
        />
      </FieldGrid>
      {truck && <Checkbox name="is_active" label="Active" defaultChecked={truck.is_active} />}
    </>
  );
}
