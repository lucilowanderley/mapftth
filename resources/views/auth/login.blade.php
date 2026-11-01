@extends('layouts.guest')
@section('title', 'Entrar')
@section('content')
<form method="POST" action="/login" class="space-y-4">
    @csrf
    <label class="block text-sm">E-mail
        <input name="email" type="email" value="{{ old('email') }}" required autofocus class="input mt-1">
    </label>
    <label class="block text-sm">Senha
        <input name="password" type="password" required class="input mt-1">
    </label>
    <label class="flex items-center gap-2 text-sm text-slate-400">
        <input type="checkbox" name="remember" class="accent-emerald-500"> Manter conectado
    </label>
    <button class="btn-primary w-full">Entrar</button>
</form>
@endsection
@section('footer')
Não tem conta? <a href="/register" class="text-emerald-400 hover:underline">Criar conta</a>
@endsection
