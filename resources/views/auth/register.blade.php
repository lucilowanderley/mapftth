@extends('layouts.guest')
@section('title', 'Criar conta')
@section('content')
<form method="POST" action="/register" class="space-y-4">
    @csrf
    <label class="block text-sm">Nome
        <input name="name" value="{{ old('name') }}" required autofocus class="input mt-1">
    </label>
    <label class="block text-sm">E-mail
        <input name="email" type="email" value="{{ old('email') }}" required class="input mt-1">
    </label>
    <label class="block text-sm">Senha
        <input name="password" type="password" required minlength="8" class="input mt-1">
    </label>
    <label class="block text-sm">Confirmar senha
        <input name="password_confirmation" type="password" required class="input mt-1">
    </label>
    <button class="btn-primary w-full">Criar conta</button>
</form>
@endsection
@section('footer')
Já tem conta? <a href="/login" class="text-emerald-400 hover:underline">Entrar</a>
@endsection
