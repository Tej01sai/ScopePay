import { requireSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { ApiFailure, handle, success } from "@/server/http";
import { projectDetailDto, projectDetailInclude } from "@/server/serializers";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireSession();
    const { id } = await context.params;
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))
      throw new ApiFailure(404, "NOT_FOUND", "Project not found.");
    const project = await getDb().project.findUnique({
      where: { id },
      include: projectDetailInclude,
    });
    if (!project) throw new ApiFailure(404, "NOT_FOUND", "Project not found.");
    return success(projectDetailDto(project));
  });
}
