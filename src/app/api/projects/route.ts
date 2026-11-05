import { requireOrigin, requireSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { ApiFailure, handle, readJson, success } from "@/server/http";
import { validateProject } from "@/server/project-input";
import { projectDto } from "@/server/serializers";

export const runtime = "nodejs";

export async function GET() {
  return handle(async () => {
    await requireSession();
    const projects = await getDb().project.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return success(projects.map(projectDto));
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    await requireSession();
    requireOrigin(request);
    const result = validateProject(await readJson(request, 256000));
    if (!result.data)
      throw new ApiFailure(
        400,
        "INVALID_INPUT",
        "Check the project fields.",
        result.fieldErrors,
      );
    return success(
      projectDto(await getDb().project.create({ data: result.data })),
      201,
    );
  });
}
