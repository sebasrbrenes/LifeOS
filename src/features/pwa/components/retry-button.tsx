"use client";

import { RotateCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function RetryButton() {
  return (
    <Button
      type="button"
      size="lg"
      className="h-11 justify-self-center px-6"
      onClick={() => window.location.reload()}
    >
      <RotateCwIcon aria-hidden="true" />
      Reintentar
    </Button>
  );
}
