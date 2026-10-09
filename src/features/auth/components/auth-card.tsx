import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer ? (
        <CardFooter className="justify-center text-sm text-muted-foreground">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}

/** Placeholder with the same footprint as a form while it streams in. */
export function AuthFormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div aria-hidden="true" className="grid gap-5">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="grid gap-2">
          <div className="h-3.5 w-20 rounded bg-muted" />
          <div className="h-11 rounded-lg bg-muted/60" />
        </div>
      ))}
      <div className="h-11 rounded-lg bg-muted" />
    </div>
  );
}
