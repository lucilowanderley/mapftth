<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;

abstract class Controller
{
    /** Garante que o projeto pertence ao usuário logado. */
    protected function authorizeProject(Request $request, Project $project): void
    {
        abort_unless($project->user_id === $request->user()->id, 404);
    }
}
