<!DOCTYPE html>
<html lang="pt-BR" class="h-full">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>MapFTTH</title>
    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/main.tsx'])
</head>
<body class="h-full bg-slate-950 text-slate-100 antialiased">
    <div id="root" class="h-full" data-user='@json(auth()->user()->only('id', 'name', 'email'))'></div>
</body>
</html>
