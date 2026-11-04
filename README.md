# MapFTTH

Sistema web para planejar e documentar redes de fibra óptica FTTH: mapa da rede, diagramas de fusão das caixas,
orçamento óptico até o cliente e importação/exportação KMZ.

📘 **[Manual de uso passo a passo](docs/MANUAL.md)**: como usar cada tela e função do sistema.

Feito com **Laravel 13 + MySQL** no backend e **React + Leaflet** no frontend. O React é compilado para arquivos
estáticos em `public/build`, então o servidor só precisa de PHP e MySQL (nada de Node rodando em produção).

## Funcionalidades (fase 1)

- **Contas e projetos**: cadastro/login, lista de projetos com contagem de CTOs, CEOs, clientes, metragem de cabos e % implantado.
- **Mapa da rede** (satélite, ruas ou escuro): adicionar POP, CEO, CTO, poste e cliente; desenhar cabos ponto a ponto
  ligando as caixas; régua de medição; arrastar caixas (as pontas dos cabos acompanham); busca; camadas por tipo.
- **Cabos**: catálogo (Drop 1/2FO, 6 a 144FO), tipo (backbone, distribuição, drop), status, cor, espessura,
  reserva técnica e comprimento calculado automaticamente.
- **Diagrama de fusão** de CTO/CEO e **editor do POP**: cabos com cores ABNT (e cor de tubo acima de 12 fibras),
  splitters balanceados 1:2 a 1:64 (RF, APC, UPC) e desbalanceados (1/99 a 50/50), OLT (modelos prontos ou
  personalizada) e DIO. Clique numa porta e depois em outra para fundir; auto-fusão em sequência; exportação do
  unifilar em PNG; status da caixa (em projeto, não implantado, implantado, certificado).
- **Orçamento óptico**: potência em cada saída de splitter e em cada cliente, com o percurso detalhado
  (OLT → DIO → fusões → cabos → splitters → drop). Clientes ficam coloridos no mapa conforme o sinal.
- **Análise de rede**: lista de clientes por nível de sinal e ocupação de portas das CTOs.
- **KMZ/KML**: importação (pastas/nomes com CTO, CEO, POP, poste, cliente viram caixas; linhas viram cabos e se ligam
  às caixas a até 15 m) e exportação do projeto completo para o Google Earth.

Os parâmetros de perda (fusão, conector, atenuação da fibra, potência da OLT, limites da ONU) ficam em
**Configurações** de cada projeto.

## Funcionalidades (fase 2)

- **Dashboard** do projeto: infraestrutura por status, sinal nos clientes, metragem de cabos por tipo,
  ocupação das CTOs e últimas alterações.
- **Áreas e relatórios**: desenhe uma área no mapa (ferramenta Área) e gere o relatório dela, ou da rede
  inteira: elementos, lista de materiais (cabos com reserva técnica proporcional, splitters, caixas,
  fusões), portas livres e sinal. Exporta planilha (CSV, abre no Excel) e imprime/salva em PDF.
- **Tabela de postes**: material, altura, esforço, proprietário e cabos que passam em cada poste, com
  edição na própria tabela. Importa planilha CSV com latitude/longitude (por exemplo, os postes da
  distribuidora exportados da BDGD da ANEEL) e exporta CSV.
- **Viabilidade**: busque um endereço ou clique no mapa e veja as CTOs com porta livre dentro do raio,
  com distância e potência prevista em cada saída.
- **OTDR virtual**: curva esperada do percurso OLT → cliente com todos os eventos. Digite a distância
  medida no OTDR e o sistema marca o ponto no mapa.
- **Equipe e permissões**: convide pessoas pelo e-mail da conta MapFTTH como Administrador (edita e
  gerencia a equipe), Projetista (edita a rede) ou Técnico (somente leitura). Só o dono exclui o projeto.
- **Histórico**: cada criação, alteração, movimentação e edição de diagrama fica registrada com autor e
  data, por projeto ou por elemento (botão de relógio no painel do elemento).

> Ao atualizar uma instalação existente, rode `php artisan migrate --force` para criar as tabelas novas.

## Rodando no Laragon (Windows)

Requisitos: PHP **8.3+**, Composer, MySQL e Node 20+ (Node só é necessário se você for alterar o frontend).

```bash
cd C:\laragon\www
git clone https://github.com/lucilowanderley/mapftth.git
cd mapftth
composer install
copy .env.example .env
php artisan key:generate
```

1. Crie o banco `mapftth` no MySQL do Laragon (HeidiSQL ou `mysql -u root -e "create database mapftth"`).
2. Rode `php artisan migrate`.
3. Acesse `http://mapftth.test` (o Laragon cria o host automaticamente; se não, use `php artisan serve`).
4. Clique em **Criar conta**.

Para alterar o frontend: `npm install` e `npm run dev` (recarrega ao salvar) ou `npm run build` para gerar `public/build`.

## Publicando no CloudPanel

1. No CloudPanel, **Add Site → Create a PHP Site**, escolha o template **Laravel** e PHP **8.3** ou superior.
   O template já aponta o Nginx para a pasta `public`.
2. Em **Databases**, crie um banco (ex.: `mapftth`) e um usuário.
3. Entre por SSH com o usuário do site e clone o projeto na pasta do site (o `htdocs/<domínio>`):

   ```bash
   cd ~/htdocs/seu-dominio.com.br
   git clone https://github.com/lucilowanderley/mapftth.git .
   composer install --no-dev --optimize-autoloader
   cp .env.example .env
   php artisan key:generate
   ```

4. Edite o `.env`: `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://seu-dominio.com.br` e os dados
   `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` do banco criado.
   Opcional: `GOOGLE_MAPS_KEY` com uma chave da Google Map Tiles API para liberar os mapas do Google
   (veja "Mapa base" no `docs/MANUAL.md`).
   O **Lançar cabo** busca o caminho pela rua no OSRM público do OpenStreetMap, então o servidor precisa de saída
   HTTPS para `routing.openstreetmap.de` e `router.project-osrm.org` (ou `ROUTING_URL` com um OSRM próprio).
5. Rode:

   ```bash
   php artisan migrate --force
   php artisan config:cache && php artisan route:cache && php artisan view:cache
   ```

6. Ative o SSL em **SSL/TLS → Actions → New Let's Encrypt Certificate**.

Os arquivos do frontend já vão compilados em `public/build`, então não é preciso Node no servidor.

**Atualizar depois:** `git pull && composer install --no-dev --optimize-autoloader && php artisan migrate --force && php artisan optimize`.

## Testes

```bash
php artisan test     # API, permissões, equipe, histórico, KMZ
npm test             # orçamento óptico, relatórios, viabilidade, OTDR
npm run typecheck
```

## Estrutura

| Caminho | O que tem |
| --- | --- |
| `app/Http/Controllers/Api` | API JSON de projetos, caixas, cabos e KMZ |
| `app/Services/KmlService.php` | Importação e exportação KMZ/KML |
| `database/migrations` | Tabelas `projects`, `network_nodes` (caixas, com o diagrama em JSON) e `cables` |
| `resources/js/pages` | Telas de projetos e do mapa |
| `resources/js/components/DiagramEditor.tsx` | Editor de fusão / POP |
| `resources/js/lib/budget.ts` | Cálculo do orçamento óptico |
| `resources/js/lib/catalog.ts` | Cores ABNT, cabos, splitters e OLTs |
| `resources/js/lib/analysis.ts` | Relatórios, viabilidade, OTDR e CSV |

## Próximas fases

Ideias para depois: app de campo offline para técnicos, ordens de serviço, integração com o sistema de
gestão do provedor (clientes e ONUs) e importação de medições reais de OTDR (arquivos .sor).
