import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import { mutate } from "swr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPrompt } from "@/frontend/lib/api/prompts";

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(100, "Máximo 100 caracteres"),
  description: z.string().max(500, "Máximo 500 caracteres").optional(),
  tags: z.string().max(300).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function PromptCreatePage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", tags: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null);
    try {
      const tags = (values.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const prompt = await createPrompt({
        name: values.name,
        description: values.description?.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
      await mutate("/api/prompts");
      navigate(`/prompts/${prompt.slug}`, { replace: true });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "No se pudo crear el prompt",
      );
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Button asChild variant="ghost" className="mb-4">
        <Link to="/prompts">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo prompt</CardTitle>
          <CardDescription>
            El slug se genera automáticamente a partir del nombre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="Email de marketing v1"
                autoFocus
              />
              {errors.name ? (
                <p className="text-destructive text-xs">{errors.name.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="Emails cortos para lanzamientos de producto"
                rows={3}
              />
              {errors.description ? (
                <p className="text-destructive text-xs">{errors.description.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="tags">Tags (opcional)</Label>
              <Input
                id="tags"
                {...register("tags")}
                placeholder="marketing, email, onboarding"
              />
              <p className="text-muted-foreground text-xs">
                Separadas por coma. Sirven para filtrar en la lista.
              </p>
            </div>

            {submitError ? (
              <p className="text-destructive text-sm">{submitError}</p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button asChild variant="ghost" type="button">
                <Link to="/prompts">Cancelar</Link>
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Crear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
