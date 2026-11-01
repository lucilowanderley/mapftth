<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityController extends Controller
{
    public function index(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project);
        $query = $project->activity()->with('user:id,name')->latest('id');
        if ($request->filled('type')) {
            $query->where('subject_type', $request->string('type'));
        }
        if ($request->filled('subject_id')) {
            $query->where('subject_id', $request->integer('subject_id'));
        }

        return response()->json($query->limit(200)->get());
    }
}
