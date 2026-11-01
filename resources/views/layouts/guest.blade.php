<!DOCTYPE html>
<html lang="pt-BR" class="h-full">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>@yield('title') · MapFTTH</title>
    @vite(['resources/css/app.css'])
</head>
<body class="h-full bg-slate-950 text-slate-100 antialiased">
<div class="min-h-full flex items-center justify-center px-4 py-12">
    <div class="w-full max-w-sm">
        <div class="flex items-center gap-2 justify-center mb-8">
            <svg viewBox="0 0 32 32" class="w-9 h-9 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                <circle cx="16" cy="16" r="3" fill="currentColor"/><path d="M16 13V4M16 19v9M13 16H4M19 16h9M9 9l4.5 4.5M23 23l-4.5-4.5"/>
            </svg>
            <span class="text-2xl font-semibold tracking-tight">Map<span class="text-emerald-400">FTTH</span></span>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
            <h1 class="text-lg font-semibold mb-4">@yield('title')</h1>
            @if ($errors->any())
                <div class="mb-4 rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-300">
                    {{ $errors->first() }}
                </div>
            @endif
            @yield('content')
        </div>
        <p class="text-center text-sm text-slate-500 mt-6">@yield('footer')</p>
    </div>
</div>
</body>
</html>
