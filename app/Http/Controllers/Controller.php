<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;

abstract class Controller
{
    private const LEVELS = ['viewer' => 1, 'editor' => 2, 'admin' => 3, 'owner' => 4];

    /**
     * Garante que o usuário logado tem pelo menos o nível pedido no projeto:
     * view (qualquer membro), edit (editor+), admin (admin ou dono), owner.
     * Retorna o papel do usuário.
     */
    protected function authorizeProject(Request $request, Project $project, string $ability = 'view'): string
    {
        $role = $project->roleOf($request->user());
        abort_unless($role, 404);
        $needed = ['view' => 1, 'edit' => 2, 'admin' => 3, 'owner' => 4][$ability];
        abort_if(self::LEVELS[$role] < $needed, 403, 'Você não tem permissão para esta ação neste projeto.');

        return $role;
    }
}
