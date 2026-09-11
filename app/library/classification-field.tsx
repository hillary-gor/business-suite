import { Field } from '@/components/ui';
import {
  LIBRARY_CLASSIFICATION_HINTS,
  LIBRARY_CLASSIFICATION_LABELS,
  type LibraryClassification,
} from '@/server/modules/library/types';

export function ClassificationField({
  allowed,
  defaultValue,
  disabled,
}: {
  allowed: readonly LibraryClassification[];
  defaultValue?: LibraryClassification;
  disabled?: boolean;
}) {
  const selected = allowed.includes(defaultValue ?? 'internal')
    ? (defaultValue ?? 'internal')
    : 'internal';

  return (
    <Field
      label="Access level"
      htmlFor="classification"
      hint="The level is enforced in the database. A stolen form cannot raise a file above your clearance."
      required
    >
      <select id="classification" name="classification" defaultValue={selected} disabled={disabled}>
        {allowed.map((level) => (
          <option key={level} value={level} title={LIBRARY_CLASSIFICATION_HINTS[level]}>
            {LIBRARY_CLASSIFICATION_LABELS[level]}
          </option>
        ))}
      </select>
    </Field>
  );
}
