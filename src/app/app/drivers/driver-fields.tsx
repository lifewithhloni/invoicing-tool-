import { Checkbox, FieldGrid, TextArea, TextField } from "@/components/form";
import type { DriverRow } from "@/lib/database.types";

export function DriverFields({ driver }: { driver?: DriverRow }) {
  return (
    <>
      <FieldGrid>
        <TextField name="full_name" label="Full name" defaultValue={driver?.full_name} required />
        <TextField
          name="slip_name"
          label="Name on weigh tickets"
          defaultValue={driver?.slip_name}
          placeholder="e.g. ENOS"
          hint="Weighbridges often print only a first name."
        />
        <TextField name="phone" label="Phone" type="tel" defaultValue={driver?.phone} />
      </FieldGrid>
      <TextArea name="notes" label="Notes" defaultValue={driver?.notes} rows={2} />
      {driver && <Checkbox name="is_active" label="Active" defaultChecked={driver.is_active} />}
    </>
  );
}
