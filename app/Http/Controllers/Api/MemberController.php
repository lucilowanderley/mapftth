<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class MemberController extends Controller
{
    public function index(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project);
        $owner = $project->user()->first(['id', 'name', 'email']);

        return response()->json([
            'owner' => $owner,
            'members' => $project->members()->with('user:id,name,email')->orderBy('id')->get(),
        ]);
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project, 'admin');
        $data = $request->validate([
            'email' => ['required', 'email'],
            'role' => ['required', Rule::in(ProjectMember::ROLES)],
        ]);
        $user = User::where('email', $data['email'])->first();
        if (! $user) {
            throw ValidationException::withMessages(['email' => 'Nenhum usuário com esse e-mail. Peça para a pessoa criar uma conta primeiro.']);
        }
        if ($user->id === $project->user_id || $project->members()->where('user_id', $user->id)->exists()) {
            throw ValidationException::withMessages(['email' => 'Essa pessoa já faz parte do projeto.']);
        }
        $member = $project->members()->create(['user_id' => $user->id, 'role' => $data['role']]);
        ActivityLog::record($project, 'member', $member, 'created', ['papel' => $data['role']], $user->name);

        return response()->json($member->load('user:id,name,email'), 201);
    }

    public function update(Request $request, Project $project, ProjectMember $member): JsonResponse
    {
        $this->authorizeProject($request, $project, 'admin');
        abort_unless($member->project_id === $project->id, 404);
        $data = $request->validate(['role' => ['required', Rule::in(ProjectMember::ROLES)]]);
        $member->update($data);
        ActivityLog::record($project, 'member', $member, 'updated', ['papel' => $data['role']], $member->user->name);

        return response()->json($member->load('user:id,name,email'));
    }

    public function destroy(Request $request, Project $project, ProjectMember $member): JsonResponse
    {
        abort_unless($member->project_id === $project->id, 404);
        // Qualquer membro pode sair do projeto; remover outros exige ser admin.
        if ($member->user_id !== $request->user()->id) {
            $this->authorizeProject($request, $project, 'admin');
        }
        ActivityLog::record($project, 'member', $member, 'deleted', null, $member->user->name);
        $member->delete();

        return response()->json(null, 204);
    }
}
