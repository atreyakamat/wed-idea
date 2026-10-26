"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, initialFormState, SubmitButton } from "@/components/ui/form";
import { slugify } from "@/lib/domain/slug";
import { createStudio } from "./actions";

export function StudioForm() {
  const [state, action] = useActionState(createStudio, initialFormState);
  const [name, setName] = useState(state.values?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(state.values?.slug));
  const shownSlug = slugEdited ? slug : slugify(name).slice(0, 40).replace(/-+$/, "");

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field
        label="Studio name"
        name="name"
        required
        maxLength={80}
        placeholder="Saltwater Studios"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={state.fieldErrors?.name}
      />
      <Field
        label="Studio link"
        name="slug"
        required
        maxLength={40}
        placeholder="saltwater"
        value={shownSlug}
        onChange={(e) => {
          setSlugEdited(true);
          setSlug(e.target.value.toLowerCase());
        }}
        hint="Lowercase letters, numbers and dashes. Used in your studio's links."
        error={state.fieldErrors?.slug}
      />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Creating studio…" className="mt-2">
        Create studio
      </SubmitButton>
    </form>
  );
}
