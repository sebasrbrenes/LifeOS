"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  type FormEvent,
} from "react";

import { idleState, type ActionState } from "@/lib/action-state";

/**
 * Runs a Server Action from a form without React's automatic form reset,
 * which would wipe what the user typed when validation fails. Optionally
 * resets after success (e.g. "register another value").
 */
export function useFormAction(
  action: (state: ActionState, formData: FormData) => Promise<ActionState>,
  { resetOnSuccess = false }: { resetOnSuccess?: boolean } = {},
) {
  const [state, dispatch, pending] = useActionState(action, idleState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.status === "success") formRef.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return { state, pending, formRef, onSubmit };
}
