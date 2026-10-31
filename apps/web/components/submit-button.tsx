"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * A form's submit button that says it's working while the form posts.
 *
 * `aria-disabled`, not `disabled`: a disabled button drops focus, and a
 * keyboard user would be thrown back to the top of the page mid-change. The
 * form still posts without JavaScript; this only adds the pending state.
 */
export const SubmitButton = ({
  children,
  pendingLabel,
  className,
}: {
  readonly children: ReactNode;
  readonly pendingLabel: string;
  readonly className: string;
}) => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-disabled={pending || undefined}
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
      className={`${className} aria-disabled:cursor-wait aria-disabled:opacity-70`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
};
