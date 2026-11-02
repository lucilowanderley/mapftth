# Manual de uso do MapFTTH

Este guia mostra, passo a passo, como usar cada função do MapFTTH: do cadastro até a rede pronta, com fusões,
orçamento óptico, relatórios e equipe. Siga a ordem do **Roteiro rápido** na primeira vez; depois use as
seções como consulta.

## Sumário

1. [Roteiro rápido: da conta ao primeiro cliente com sinal](#1-roteiro-rápido)
2. [Conta e login](#2-conta-e-login)
3. [Meus projetos](#3-meus-projetos)
4. [A tela do mapa](#4-a-tela-do-mapa)
5. [Adicionar POP, CEO, CTO, poste, cliente e condomínio](#5-adicionar-pop-ceo-cto-poste-cliente-e-condomínio)
6. [Desenhar e editar cabos](#6-desenhar-e-editar-cabos) (inclui as [3 formas de ligar a CTO no cabo](#ligar-a-cto-no-cabo-3-formas))
7. [Editor do POP: rack, OLT e DIO](#7-editor-do-pop-rack-olt-e-dio)
8. [Diagrama de fusão da CEO e da CTO (splitters)](#8-diagrama-de-fusão-da-ceo-e-da-cto)
9. [Ligar o cliente e ver o sinal](#9-ligar-o-cliente-e-ver-o-sinal)
10. [Orçamento óptico](#10-orçamento-óptico)
11. [Exportar o unifilar em PNG](#11-exportar-o-unifilar-em-png)
12. [Análise de rede](#12-análise-de-rede)
13. [Dashboard](#13-dashboard)
14. [Áreas e relatórios (CSV e PDF)](#14-áreas-e-relatórios)
15. [Tabela de postes e importação BDGD/ANEEL](#15-tabela-de-postes)
16. [Viabilidade de atendimento](#16-viabilidade)
17. [OTDR virtual](#17-otdr-virtual)
18. [Importar e exportar KMZ/KML (Google Earth)](#18-kmz-e-kml)
19. [Equipe e permissões](#19-equipe-e-permissões)
20. [Histórico de alterações](#20-histórico)
21. [Configurações do projeto (parâmetros de perda)](#21-configurações-do-projeto)
22. [Atalhos e dicas](#22-atalhos-e-dicas)

---

## 1. Roteiro rápido

Para ver a rede funcionando de ponta a ponta, faça nesta ordem:

1. **Crie a conta** e entre ([seção 2](#2-conta-e-login)).
2. **Crie um projeto** e escolha a cidade no mapa ([seção 3](#3-meus-projetos)).
3. No mapa, coloque **1 POP**, **1 CTO** e **1 cliente** ([seção 5](#5-adicionar-pop-ceo-cto-poste-e-cliente)).
4. Com a ferramenta **Cabo**, desenhe um cabo do **POP até a CTO** ([seção 6](#6-desenhar-e-editar-cabos)).
5. Abra o **Editor do POP**: adicione um **DIO** e uma **OLT**, vincule o cabo ao DIO, use **Auto Fusão** na matriz
   de fusão e depois **Auto-Patch** ([seção 7](#7-editor-do-pop-olt-e-dio)).
6. Abra o **Diagrama de fusão** da CTO: adicione um **splitter 1:8**, ligue a fibra 1 do cabo à entrada do
   splitter ([seção 8](#8-diagrama-de-fusão-da-ceo-e-da-cto)).
7. Selecione o cliente e clique em **Ligar drop à CTO mais próxima**. Volte ao diagrama da CTO e ligue a fibra do
   drop a uma saída do splitter ([seção 9](#9-ligar-o-cliente-e-ver-o-sinal)).
8. Clique no cliente: a **Potência na ONU** aparece em dBm e o ícone fica colorido conforme o sinal.

> O caminho do sinal sempre precisa estar completo e fundido até uma OLT. Se faltar uma fusão em qualquer caixa,
> o cliente aparece como **Sem sinal**.

---

## 2. Conta e login

1. Abra o endereço do sistema (no Laragon, `http://mapftth.test`; no servidor, o seu domínio).
2. Na primeira vez, clique em **Criar conta** e preencha **Nome**, **E-mail**, **Senha** e **Confirmar senha**.
3. Nas próximas vezes, entre com **E-mail** e **Senha**. Marque **Manter conectado** para não precisar entrar de novo.
4. Para sair, use **Sair** no canto inferior esquerdo da tela **Meus projetos**.

---

## 3. Meus projetos

É a tela inicial depois do login. Cada projeto aparece como um cartão com a quantidade de **CTOs**, **CEOs**,
**Clientes**, a metragem de **Cabos** e a barra de **% implantado**.

**Criar um projeto**

1. Clique em **Novo projeto** (ou **Criar primeiro projeto**, se a lista estiver vazia).
2. Preencha o **Nome** (ex.: *Expansão Centro*).
3. Em **Localização inicial**, digite a cidade ou o endereço e escolha um resultado da lista, ou clique em
   **Usar minha localização**.
4. Se quiser ajustar, clique no mini mapa: o ponto verde marca o centro onde o projeto vai abrir.
5. Clique em **Criar projeto**. O mapa do projeto abre em seguida.

**Outras ações**

- **Buscar...**: filtra os projetos pelo nome.
- **Abrir**: clique em qualquer lugar do cartão.
- **Excluir**: passe o mouse sobre o cartão e clique na lixeira. Só o **dono** do projeto vê essa opção, e a
  exclusão apaga toda a rede (não tem volta).
- Projetos que outras pessoas compartilharam com você mostram **Compartilhado por (nome) · (papel)**.

---

## 4. A tela do mapa

A tela tem quatro partes:

| Onde | O que tem |
| --- | --- |
| **Barra lateral (esquerda)** | Nome do projeto, % implantado, seu papel, busca, menu (Meus projetos, Dashboard, Análise de rede, Relatório da rede, Tabela de postes, Equipe, Histórico, Importar KMZ/KML, Exportar KMZ, Configurações) e os totais de POPs, CEOs, CTOs, clientes e metros de cabo. |
| **Barra de ferramentas (topo)** | Selecionar, CTO, CEO, POP, Poste, Cliente, Condomínio, Cabo, Área, Reserva, Régua, Viabilidade. |
| **Painel de camadas (direita)** | Mapa base e os elementos visíveis. |
| **Dica (rodapé do mapa)** | Explica o que fazer com a ferramenta escolhida e mostra botões como **Finalizar cabo** e **Finalizar área**. |

**Mapa base** (painel da direita): clique em **Satélite**, **Ruas** ou **Relevo**. Abaixo dos botões aparece o
**motor** de mapas em uso. O motor é escolhido em **Configurações** ([seção 21](#21-configurações-do-projeto)) e o
padrão é o **OpenStreetMap**. O sistema lembra o último estilo e o último motor escolhidos neste navegador, mesmo
depois de fechar ou apertar F5.

| Motor | Satélite | Ruas | Relevo | Chave? |
| --- | --- | --- | --- | --- |
| **OpenStreetMap** (padrão) | Imagens da Esri (o OpenStreetMap não tem satélite) | OpenStreetMap | OpenTopoMap | Não precisa |
| **Esri (ArcGIS)** | World Imagery | World Street Map | World Topo Map | Não precisa |
| **Google Maps** | Google Satélite | Google Mapa | Google Relevo | Só aparece com a chave configurada (abaixo) |

O zoom vai até 21; acima do zoom máximo de cada mapa a imagem é ampliada.

> **Mapas do Google**: o Google só permite usar os mapas dele com uma chave da **Map Tiles API** (o uso direto dos
> tiles, sem chave, é proibido pelos termos do Google). Para ativar: no Google Cloud Console crie um projeto, ative
> a cobrança e a **Map Tiles API**, crie uma chave de API e restrinja-a ao domínio do sistema (restrição por site
> HTTP). Depois coloque `GOOGLE_MAPS_KEY=sua-chave` no `.env` do servidor e rode `php artisan config:cache` (no
> Laragon, `php artisan config:clear`). O Google dá uma cota mensal gratuita e cobra acima dela. Se a chave for
> recusada, o sistema avisa e volta para o OpenStreetMap.

**Camadas** (painel da direita): ligue e desligue **POPs, CEOs, CTOs, Postes, Clientes**, **Cabos backbone,
distribuição e drop**, **Áreas** e **Rótulos** (nomes). Os nomes das caixas aparecem a partir do zoom 17 (o POP
aparece sempre).

**Buscar** (barra lateral): digite parte do nome de uma caixa, cliente ou cabo e clique no resultado; o mapa vai
até ele e já o seleciona. Também aceita coordenadas, como `-8.0476, -34.8770` (formato do Google Maps) ou
`8°03'12"S 34°52'37"W`: clique em **Ir para coordenada** e o ponto fica marcado no mapa (**Limpar marcação** tira).

**Régua**: escolha **Régua** e clique nos pontos do trajeto. A distância total aparece na dica do rodapé.
**Esc** limpa a medição.

---

## 5. Adicionar POP, CEO, CTO, poste, cliente e condomínio

1. Na barra de ferramentas, escolha **POP**, **CEO**, **CTO**, **Poste**, **Cliente** ou **Condomínio**.
2. Clique no mapa onde o elemento fica. Ele é criado na hora com um nome automático e o painel de edição abre
   à esquerda. Você pode continuar clicando para colocar vários do mesmo tipo.
3. Volte para **Selecionar** (ou aperte **Esc**) quando terminar.

**Inserir por coordenadas**: com a ferramenta do elemento escolhida, aparece abaixo da barra de ferramentas o painel
**(Elemento) por coordenadas**. Digite **Latitude** e **Longitude** e clique em **Adicionar** (ou Enter). O mapa vai
até o novo elemento. Aceita graus decimais com ponto ou vírgula (`-8.0476` ou `-8,0476`) e graus/minutos/segundos
(`8°03'12"S`; use S/W/O para sul e oeste). Se colar o par inteiro, como `-8.0476, -34.8770`, no campo Latitude,
os dois campos são preenchidos.

**Editar um elemento**: com **Selecionar**, clique nele. **Duplo clique** abre o editor direto: na CTO, CEO ou POP
(e no condomínio) abre o diagrama de fusão / editor do POP; no poste e no cliente coloca o cursor no campo **Nome** do painel. No painel:

- **Nome**, **Status** (*Em projeto*, *Não implantado*, *Implantado*, *Certificado*) e **Observações**.
- **Posição**: latitude e longitude do elemento. Digite os valores exatos (mesmos formatos aceitos acima) e salve
  para reposicionar com precisão. O ícone de mira centraliza o mapa no elemento e o ícone de copiar copia
  `latitude, longitude` para colar em outro programa.
- **Cliente**: campo **Endereço**, potência na ONU e os botões de drop e OTDR ([seção 9](#9-ligar-o-cliente-e-ver-o-sinal)).
- **Poste**: **Código / plaqueta**, **Material**, **Altura (m)**, **Esforço (daN)**, **Distribuidora / proprietário**
  e a lista de **cabos neste poste**.
- **Condomínio**: **Tipo** (*Casas* ou *Prédios*), número de **Casas** ou **Apartamentos**, **Quadras** ou
  **Prédios / torres**, **Andares** (só prédios), **Endereço**, **Síndico / contato** e **Telefone**.
- **POP, CEO, CTO e condomínio**: botão **Editor do POP** ou **Diagrama de fusão**.
- Clique em **Salvar alterações**. A lixeira exclui; o relógio mostra o histórico daquele elemento.

**Condomínio (casas ou prédios)**

1. Escolha **Condomínio** na barra de ferramentas. Abaixo dela aparece **Condomínio de: Casas | Prédios**; escolha o
   tipo antes de clicar no mapa.
2. Clique no mapa. O condomínio é criado com o nome *Cond-1*, *Cond-2*... e o ícone mostra o tipo: dois prédios
   ou duas casinhas, em rosa.
3. No painel, preencha o número de unidades (casas ou apartamentos), as quadras ou prédios e os andares.

O condomínio funciona como uma caixa: o cabo pode terminar nele, passar por ele em **sangria** (e pela opção
**Conectar caixas no traçado**) e ele tem **Diagrama de fusão** próprio para os splitters e as fusões da rede
interna. Os drops dos moradores saem dele como saem de uma CTO. Nos **relatórios** aparece o total de condomínios e
de unidades (útil para contar casas cobertas), e no **KMZ** eles vão para a pasta *Condomínios*.

**Mover (arrastar)**: com **Selecionar**, clique e arraste qualquer elemento (POP, CEO, CTO, poste, cliente ou condomínio).
Enquanto você arrasta, os cabos acompanham: as pontas ligadas ao elemento e os pontos de cabos que passam
exatamente por ele (por exemplo, um cabo apoiado num poste). Ao soltar, a posição é salva e o comprimento dos
cabos é recalculado.

Para evitar movimentos acidentais, ao soltar o elemento o rodapé pergunta **Mover (nome) (distância) para
(coordenadas)?**. Clique em **Confirmar** (ou Enter) para salvar, ou **Cancelar** (ou Esc) para o elemento e os
cabos voltarem ao lugar. Se preferir mover sem pergunta, desmarque **Confirmar ao mover** no painel da direita (a
escolha fica salva neste navegador). Errou mesmo assim? Aperte **Ctrl+Z** ou clique em **Desfazer movimento** no
rodapé para voltar o último movimento.

---

## 6. Desenhar e editar cabos

### Ligar a CTO no cabo: 3 formas

| Situação | Use |
| --- | --- |
| O cabo ainda não existe | **Forma 1**: ferramenta **Cabo**, já ligando nas caixas |
| O cabo já está no mapa e a caixa fica na ponta ou no meio | **Forma 2**: botão direito no cabo › **Conectar a caixa, poste ou POP** |
| Várias CTOs ao longo do caminho, de uma vez | **Forma 3**: botão direito no cabo › **Conectar caixas no traçado** |

**Forma 1: lançar o cabo já ligado nas caixas (ferramenta Cabo)**

1. Escolha **Cabo** na barra de ferramentas. Logo abaixo dela aparece **Tipo de cabo**: escolha o modelo do
   catálogo (Drop 1FO a 144FO). O último tipo usado fica lembrado neste navegador; o padrão é **Cabo 12FO**.
2. Clique na **caixa de origem** (ex.: o POP ou a CEO). O cabo já nasce conectado nela. Se clicar no mapa vazio,
   ele começa com a ponta solta.
3. Clique no mapa para criar os **pontos do trajeto** (as curvas pela rua ou pelos postes). O **botão direito**
   do mouse desfaz o último ponto; o botão **Desfazer ponto** no rodapé faz o mesmo.
4. Clique na **caixa de destino**: o cabo é finalizado sozinho e já fica conectado nas duas caixas. Também dá para
   terminar com **Enter** ou com o botão **Finalizar cabo (metragem)** no rodapé (aí a ponta fica solta).
5. **Esc** ou **Cancelar** descarta o desenho.

Se uma das pontas for um cliente, o cabo vira **Cabo Drop 1FO** (a não ser que você já tenha escolhido um Drop).

**Forma 2: puxar o cabo até a caixa (ponta = conexão simples, meio = sangria)**

1. Com **Selecionar**, clique com o **botão direito** no cabo e escolha **Conectar a caixa, poste ou POP**.
2. Aparecem alças redondas verdes em todos os pontos do cabo (inclusive nas pontas) e, no rodapé, o aviso
   **Conectando...** com o botão **Concluir**.
3. **Na ponta (conexão simples)**: arraste a alça da ponta e solte sobre a caixa, o poste, o POP ou o cliente.
   Um círculo verde mostra onde vai encaixar. A ponta gruda no objeto e o cabo passa a aparecer no diagrama da
   caixa. Soltar a ponta no vazio desconecta (as fusões daquela ponta são removidas).
4. **No meio (sangria)**: arraste um ponto do meio (ou um círculo pequeno entre dois pontos) e solte sobre uma
   **CTO, CEO ou POP**. O sistema faz a **sangria**: o cabo é dividido em dois trechos (*Nome · T1* chegando na
   caixa e *Nome · T2* saindo dela) e, dentro da caixa, todas as fibras ficam em **passagem direta** (veja abaixo).
   Soltar um ponto do meio sobre um **poste** só apoia o cabo no poste, sem cortar.
5. **Duplo clique** no cabo cria um ponto novo naquele lugar, para você puxá-lo até a caixa.
6. Clique em **outro cabo** para trabalhar nele também. Clique em **Concluir** (ou **Esc**) para sair do modo.

**Forma 3: conectar todas as CTOs do traçado de uma vez**

1. Com **Selecionar**, clique com o **botão direito** no cabo. O item **Conectar caixas no traçado (N)** mostra
   quantas CTOs, CEOs e condomínios estão a até **30 m** do cabo.
2. Clique nele e confirme em **Sim, conectar** (a caixa lista quais serão ligadas).
3. Cada caixa no meio do caminho vira um ponto do cabo com **sangria** (trechos *T1, T2, T3...*). Uma caixa logo
   depois de uma **ponta solta** vira a ponta do cabo (conexão simples).

Vale para CTO e CEO. Para poste e POP, use a **forma 2**.

**O que é a passagem direta (sangria)**

Na sangria as fibras **não são cortadas**: no diagrama da caixa elas aparecem ligadas de um trecho ao outro com
uma **linha tracejada**. Passagem direta **não conta como fusão** (não soma perda no orçamento óptico nem entra na
contagem de fusões). Para derivar uma fibra na caixa (ex.: levar a fibra 3 a um splitter), abra o **Diagrama de
fusão**, clique na fibra, use **Remover passagem** e ligue a fibra ao splitter normalmente. As caixas no fim do
cabo original continuam com as fusões que já tinham, agora no último trecho.

O menu do botão direito no cabo também tem **Editar** (abre o painel do cabo), **Posicionar reserva** e **Excluir**.

### Reserva técnica no mapa

Cada reserva técnica (sobra de cabo enrolada) tem **local**, **metragem** e **tipo**:

- **Suspensa** (círculo com borda laranja): aérea, presa no poste.
- **Subterrânea** (quadrado com borda marrom): em caixa subterrânea ou câmara.

**Posicionar**

1. Escolha **Reserva** na barra de ferramentas, ou clique com o botão direito no cabo › **Posicionar reserva**
   (aí a reserva vai sempre para esse cabo). No painel do cabo também há o botão **+ Posicionar reserva no mapa**.
2. Logo abaixo da barra, informe a **metragem** e escolha **Suspensa** ou **Subterrânea**. Os valores ficam
   lembrados para as próximas reservas.
3. Clique **sobre o cabo** no ponto da reserva. Clicando num **poste** (ou caixa) por onde o cabo passa, a
   reserva fica exatamente no poste e leva o nome dele na observação.

**Ver e editar**

- No mapa, o ícone mostra o tipo; passe o mouse para ver a metragem (a partir do zoom 18 ela aparece fixa).
- **Arraste** o ícone para mudar o local: ele sempre volta para cima do cabo, no ponto mais próximo.
- Clicar no ícone seleciona o cabo. No painel, em **Reservas técnicas no mapa**, cada reserva (R1, R2...) mostra
  o tipo, a metragem, as coordenadas, o botão de **mostrar no mapa** e o **X** para remover. Mudanças nessa lista
  são salvas na hora.
- Numa **sangria**, cada reserva vai junto com o trecho do cabo onde ela está.
- Projetos antigos: a metragem de reserva que já existia virou uma reserva **suspensa no meio do cabo**, com a
  observação *"Migrada: posicione no local correto"*. Arraste-a para o lugar certo.

A reserva também aparece no **KMZ** exportado (pasta *Reservas técnicas*, com metragem e tipo) e nos
**relatórios** (quantidade e metros de reservas suspensas e subterrâneas; no relatório de área, só as que estão
dentro dela).

**Editar** (clique no cabo com **Selecionar**):

- **Modelo do catálogo**: Drop 1FO e 2FO, 6FO, 12FO, 24FO, 36FO (distribuição), 48FO, 72FO e 144FO (backbone), ou
  **Personalizado**. Escolher um modelo já preenche nome, fibras, fibras por tubo, tipo e cor.
- **Fibras** e **Fibras/tubo**: as cores seguem o padrão **ABNT** (verde, amarelo, branco, azul, vermelho,
  violeta, marrom, rosa, preto, cinza, laranja, água-marinha). Acima de 12 fibras o diagrama mostra também a cor
  do tubo.
- **Tipo** (Backbone, Distribuição, Drop) e **Status**.
- **Reserva técnica**: o painel mostra a soma das reservas do cabo, que entra no **Total**, no orçamento óptico e
  nos relatórios. Cada reserva tem local no mapa (veja [Reserva técnica no mapa](#reserva-técnica-no-mapa)).
- **Cor no mapa** e **Espessura**.
- **Estilo da linha**: **Contínuo**, **Tracejado** ou **Pontilhado**. Em **Automático** (o padrão), o cabo fica
  tracejado enquanto estiver *Em projeto* e contínuo nos demais status. Cada botão mostra uma prévia com a cor e a
  espessura do cabo.
- **Pontos do cabo**: a partir do zoom 16, cada ponto (vértice) de todos os cabos aparece como uma bolinha de
  **fundo branco com borda na cor do cabo**. O cabo selecionado ganha um halo amarelo e mantém a própria cor.
- **Traçado**: com o cabo selecionado, os pontos viram alças arrastáveis. Arraste um **ponto** para movê-lo;
  arraste uma **bolinha menor e translúcida** (no meio de cada trecho) para criar um ponto novo; clique com o
  **botão direito** num ponto para removê-lo.
  Ao passar o mouse sobre um ponto (não precisa ser exatamente em cima, há uma folga de alguns pixels), ele
  **cresce, fica preenchido com a cor do cabo e ganha um anel amarelo**, e o cursor vira a seta de mover; o destaque
  continua enquanto você arrasta. Nas bolinhas de criar ponto o cursor mostra um **+**. As caixas, postes e
  clientes também crescem um pouco quando o mouse passa por cima. As pontas ligadas a uma caixa não têm alça: elas se movem quando
  você arrasta a própria caixa. A alteração é salva ao soltar.
- **Duplo clique** no cabo coloca o cursor no campo **Nome do cabo**.
- **Salvar alterações**. Se você reduzir o número de fibras, as fusões das fibras que sobrarem são removidas
  (o sistema pergunta antes). Excluir o cabo também remove as fusões dele nas caixas.

---

## 7. Editor do POP: rack, OLT e DIO

Selecione o POP e clique em **Editor do POP** (ou duplo clique no POP). O editor abre um **canvas** escuro com
**cards** que você arrasta pelo cabeçalho: um card para cada **cabo** que chega ao POP, e um card para cada **rack**,
**DIO**, **OLT** e **equipamento ativo** que você adicionar. Na primeira vez os cards já vêm organizados (cabos à esquerda,
DIOs no meio, OLTs à direita).

**Barra de ferramentas**

| Botão | O que faz |
| --- | --- |
| **OLT**, **DIO**, **Ativo** | Adicionam um equipamento ao canvas. |
| **Rack** | Adiciona um rack de piso ou suspenso, com a altura em U. |
| Contadores | **Rack**, **OLT** e **DIO** (quantidade), **Portas** (portas do DIO com cordão / total) e **PON** (em uso / total). |
| **Canvas 2D** / **Manobra** | Alterna entre o canvas com os cards e a tabela de manobra porta a porta. |
| **Cordões** | Mostra ou esconde no canvas os cordões (patch) entre DIO, OLT e ativos. |
| **Traço VFL** | Liga a "caneta de luz vermelha": clique numa porta e veja o caminho aceso. |
| **PNG** | Baixa uma imagem do POP com os cards, vínculos e cordões. |
| ↶ (desfazer) | Desfaz a última alteração (também **Ctrl+Z**). |
| **Salvar** / **Salvar e sair** | Grava o POP (e fecha, no segundo). |
| **Auto-Patch** | Liga automaticamente as portas do DIO que já têm fusão às portas PON livres da OLT. |

No canto inferior direito ficam o **zoom** e o **enquadrar tudo**. Arraste o fundo para mover a vista e use a
roda do mouse para o zoom. O status do POP (*Em projeto*, *Implantado*...) fica ao lado do título.

**Rack (piso ou suspenso)**

1. Clique em **Rack**.
2. Dê um **Nome** e escolha a **Instalação**: **Piso** (rack apoiado no chão) ou **Suspenso** (rack de parede).
3. Escolha a **altura em U** (6U a 48U) ou digite outro tamanho. 1U = 44,45 mm.
4. Clique em **Criar rack**.

O rack aparece à direita, em **vista frontal**, com as U numeradas de baixo (**U1**) para cima. Cada equipamento
instalado ocupa as suas U e aparece na cor do tipo: **DIO azul**, **OLT roxa** e **ativo verde**. O rodapé mostra
quantas U estão livres.

Há três jeitos de colocar um equipamento no rack:

- Ao criar ou editar uma **OLT**, **DIO** ou **Ativo**, escolha o rack no campo **Instalar no rack**. O editor
  coloca o equipamento na primeira posição livre, de cima para baixo.
- No cabeçalho do rack, clique em **Instalar equipamento** (ícone de caixa com +) e escolha o equipamento.
- Clique numa **U vazia** do rack para instalar um equipamento exatamente ali.

Na janela de instalação você ajusta a **Posição** (a U de baixo) e a **Altura (U)**. A altura vem pronta pelo
tamanho do equipamento (DIO de até 24 portas = 1U, 48 = 2U, 72 = 3U, 144 = 4U; OLT de 1 ou 2 slots = 1U ou 2U;
switch = 1U) e pode ser trocada. O editor não deixa sobrepor dois equipamentos nem passar do topo do rack.

Clique num equipamento dentro do rack para mudar a posição ou **Retirar do rack**. O card do equipamento continua no
canvas com as portas, e o rodapé dele mostra onde está instalado (por exemplo *Rack 1 · U40–41*). Se você diminuir o
rack e algum equipamento deixar de caber, ele fica com borda vermelha até ser reposicionado. Excluir o rack não
exclui os equipamentos: eles só ficam fora do rack. O rack também sai no **PNG** do POP.

**Adicionar o DIO**

1. Clique em **DIO**.
2. Escolha a especificação: **12, 24, 36, 48, 72 ou 144** portas. Cada **bandeja** tem **12 portas**, então o
   quadro mostra *portas totais* e *bandejas*.
3. Clique em **Criar dispositivo**.

O DIO aparece em **vista frontal**: uma linha por bandeja (**T1**, **T2**...) com as portas numeradas. No cabeçalho
do card ficam as ferramentas do DIO:

| Ícone | Ferramenta |
| --- | --- |
| Grade | **Matriz de fusão** do DIO. |
| Corrente | **Vincular cabos**: escolha quais cabos entram neste DIO. |
| Plugue | **Patch**: abre a vista Manobra já neste DIO. |
| Lápis | **Editar** nome e número de portas. |
| Lixeira | **Excluir** o DIO (e os splitters e conexões dele). |

Depois de vincular, o nome do cabo aparece como etiqueta logo abaixo do cabeçalho e uma linha na cor do cabo liga o
card do cabo ao DIO. Cada porta que recebe uma fibra fundida ganha uma **bolinha na cor do cabo** no canto. A porta
fica **azul** quando tem cordão na frente (patch).

**Matriz de fusão do DIO**

Abra pelo ícone de grade. A tela tem três colunas:

- **Cabos vinculados**: cada cabo com seus tubos (**T1**, **T2**...) e as fibras nas cores ABNT.
- **Splitters**: clique em **Adicionar** para colocar um splitter dentro do DIO. A entrada recebe uma fibra e as
  saídas podem ser fundidas nas portas do DIO.
- **Bandejas**: as portas do DIO, 12 por bandeja.

Para fundir, clique numa **fibra** (ou numa **saída do splitter**) e depois numa **porta da bandeja**. Para ligar
uma fibra no splitter, clique na fibra e depois em **Entrada livre**. Clique num item já fundido para desfazer.
**Auto Fusão** funde as fibras livres dos cabos vinculados, em ordem, nas portas livres do DIO. **Vincular cabos**
também está no topo da matriz. Clique em **Concluir** para voltar ao canvas (as fusões só são gravadas quando você
salva o POP).

**Adicionar a OLT**

1. Clique em **OLT**.
2. No campo **Modelo**, procure e escolha: **Configuração personalizada**, **OLT Huawei MA5608T** (2×16),
   **OLT V-Sol 8 portas** (1×8) ou **OLT ZTE C320** (2×16).
3. Ajuste **Nome**, **Slots**, **PON/slot**, **Uplinks** e **TX dBm** (o padrão vem das Configurações). A miniatura
   mostra como fica a frente da OLT.
4. Clique em **Criar OLT**.

A OLT aparece em **vista frontal**: uma linha por slot (**S1**, **S2**...) com as portas PON e uma linha **UP** com
os uplinks. Portas PON com cordão ficam **roxas**; uplinks com cordão ficam **laranja**. Ferramentas do card:
**Patch**, **Editar** e **Excluir**.

**Equipamento ativo**

Clique em **Ativo** para adicionar um switch, roteador, BNG, servidor, firewall, nobreak ou patch panel UTP com o
número de portas que quiser (até 96). As portas
do ativo recebem cordões dos **uplinks da OLT** (ou da frente do DIO, em links ponto a ponto). O ativo não é fonte
de sinal PON: o orçamento óptico só conta caminhos que chegam numa porta PON de OLT.

**Cordões (patch)**

Há três jeitos:

1. **Auto-Patch** (barra de ferramentas): liga em sequência cada porta do DIO que tem fusão a uma PON livre.
2. **No canvas**: clique numa porta (do DIO, da OLT ou do ativo) e depois na porta de destino. Clique numa porta já
   ligada para ver o cordão, a potência na fibra de saída e o botão **Remover** (ou tecla **Delete**).
3. **Na vista Manobra**: para cada porta do DIO aparecem a bandeja, a **fusão** (cabo, fibra e cor), uma lista para
   escolher a **porta PON** (ou porta de ativo) e a **potência** em dBm. Em cada OLT aparecem as PON em uso e os
   uplinks, com a lista para ligá-los aos ativos.

**Traço VFL**

Clique em **Traço VFL** (o botão fica vermelho) e depois em qualquer porta. O caminho da luz acende em vermelho: as
portas, os cordões, o DIO, a linha do cabo e o card do cabo por onde a luz sai. O painel no canto mostra por qual
**cabo e fibra** a luz sai do POP e para qual caixa ela segue. Clique de novo em **Traço VFL** para desligar.

> POPs feitos antes desta versão abrem normalmente: os cards são organizados na primeira abertura e os cabos já
> fundidos em cada DIO aparecem como vinculados.

---

## 8. Diagrama de fusão da CEO e da CTO

Selecione a caixa e clique em **Diagrama de fusão** (ou duplo clique nela). Cada cabo que chega ou sai aparece
como um bloco (*de POP...* / *para CTO...*), com as fibras nas cores ABNT.

> Se aparecer *"Nenhum cabo chega nesta caixa ainda"*, desenhe primeiro os cabos no mapa ligando a caixa.

**Mexer no diagrama**

- **Arrastar** um bloco muda a posição dele. Arrastar o fundo move a tela.
- **Rolar o mouse** dá zoom. Os botões no canto fazem zoom +, zoom − e **ajustar à tela**.
- **Inverter lado**: selecione o bloco de um cabo e clique para passá-lo para o outro lado.

**Fundir duas fibras (ou fibra com splitter)**

1. Clique na **primeira porta**. Ela fica selecionada e um quadro no canto mostra a **potência que chega nela**,
   com o link **Ver orçamento**.
2. Clique na **segunda porta**. A linha da fusão é desenhada.
3. Para desfazer, clique numa porta já ligada (isso seleciona a fusão) e use **Remover fusão** ou a tecla
   **Delete**.

O sistema não deixa ligar duas portas do mesmo elemento nem uma porta que já está ocupada.

**Adicionar splitter**

1. Clique em **Splitter**.
2. Escolha **Balanceado** (1:2, 1:4, 1:8, 1:16, 1:32, 1:64, nas versões **RF**, **AC APC** e **AC UPC**) ou
   **Desbalanceado** (1/99, 2/98, 5/95 ... 50/50). A lista mostra a perda de cada saída.
3. O splitter aparece no diagrama. Ligue a **entrada (E)** a uma fibra do cabo que chega e as **saídas (1, 2, 3...)**
   às fibras que saem (drops ou outros cabos).
4. Splitters conectorizados (APC/UPC) somam também a perda de conector no orçamento.

Para remover um splitter, selecione o bloco e clique em **Remover**. Num bloco de cabo, **Remover** apaga
só as fusões desse cabo nesta caixa (o cabo em si se exclui no mapa).

<a id="auto-fusão"></a>
**Auto-fusão** (sangria e emendas em sequência)

1. Clique em **Auto-fusão**.
2. Escolha o **Cabo de origem** e o **Destino** (outro cabo).
3. Em **Começar na porta/fibra do destino**, informe onde a sequência começa (ex.: 1 para 1↔1, 2↔2...; 13 para
   começar no segundo tubo).
4. Clique em **Fundir**. As fibras que já estiverem ocupadas são puladas.

**Potência**: o botão **Potência** liga ou desliga os valores de sinal em dBm em cada porta.

**Status da caixa** (rodapé): marque *Em projeto*, *Não implantado*, *Implantado* ou *Certificado*.

**Salvar**: **Aplicar** salva e mantém o editor aberto; **Salvar e sair** salva e fecha. Se fechar com alterações
não salvas, o sistema pergunta antes.

---

## 9. Ligar o cliente e ver o sinal

1. Coloque o cliente no mapa (ferramenta **Cliente**) e preencha o **Endereço** no painel.
2. Clique em **Ligar drop à CTO mais próxima**. O sistema cria um **Drop 1FO** da CTO mais próxima até o cliente.
   (Você também pode desenhar o drop à mão com a ferramenta **Cabo**.)
3. Abra o **Diagrama de fusão** dessa CTO e ligue a fibra do drop a uma **saída livre do splitter**.
4. Salve. Clique no cliente: o quadro **Potência na ONU** mostra o sinal em dBm e a situação:

| Cor | Situação | Quando |
| --- | --- | --- |
| Verde | **OK (ideal)** | entre o limite de atenção e o máximo da ONU |
| Amarelo | **Atenção** | abaixo do limite de atenção (padrão −25 dBm) |
| Vermelho | **Crítico** | abaixo da sensibilidade da ONU (padrão −27 dBm) |
| Roxo | **Sinal alto** | acima do máximo da ONU (padrão −8 dBm) |
| Cinza | **Sem sinal** | o caminho não chega a uma OLT |

O ícone do cliente no mapa fica com a mesma cor.

---

## 10. Orçamento óptico

Abra o orçamento clicando no quadro **Potência na ONU** de um cliente (ou em **Ver orçamento** numa porta do
diagrama). A janela mostra:

- **Potência final** e **Status**.
- **Origem (OLT)** e **Perda total** com o número de elementos no caminho.
- **Detalhes do percurso**: cada passo, na ordem, com a perda em dB: OLT, conector do DIO, fusões (F-1, F-2...),
  cabos (com metragem e reserva técnica), splitters e drop.
- A faixa aceita na ONU, conforme as **Configurações** do projeto.

---

## 11. Exportar o unifilar em PNG

No **Editor do POP** (botão **PNG** na barra de ferramentas) ou no **Diagrama de fusão** (canto superior direito),
clique em **PNG**. O arquivo baixa com o
diagrama completo, o nome da caixa, a data, as coordenadas e o status. Use para mandar à equipe de campo ou anexar
ao projeto.

---

## 12. Análise de rede

Barra lateral → **Análise de rede**.

- No topo: total de **Clientes**, **Portas livres** e metragem de **Cabos**.
- Filtre os clientes por situação (**OK**, **Atenção**, **Crítico**, **Sinal alto**, **Sem sinal**).
- A tabela mostra **Cliente**, **Potência**, **Perda** e **Situação**. Clique numa linha para ir até o cliente no
  mapa.
- Em **Ocupação das CTOs**, cada CTO mostra portas usadas/total. Clique para ir até ela.

---

## 13. Dashboard

Barra lateral → **Dashboard**. Uma visão geral do projeto:

- **Infraestrutura por status**: quantas caixas estão em projeto, não implantadas, implantadas e certificadas.
- **Sinal nos clientes**: quantos estão OK, em atenção, críticos etc.
- **Metragem de cabos por tipo**: backbone, distribuição e drop.
- **Ocupação das CTOs**.
- **Últimas alterações**: quem mexeu em quê e quando.

---

## 14. Áreas e relatórios

**Desenhar uma área** (ex.: um bairro ou uma etapa da obra)

1. Escolha **Área** na barra de ferramentas.
2. Clique nos vértices do polígono (pode clicar em cima das caixas também).
3. Com 3 pontos ou mais, aperte **Enter** ou clique em **Finalizar área**. **Esc** cancela.
4. No painel da área, dê um **Nome**, escolha a **Cor**, escreva **Observações** e clique em **Salvar área**. A lixeira exclui
   só a área (a rede não é afetada).

**Gerar o relatório**

- Da área: clique na área e depois em **Relatório da área**.
- Da rede toda: barra lateral → **Relatório da rede**.

O relatório traz **Elementos** (quantidade por tipo e status), **Lista de materiais** (cabos por modelo com a
reserva técnica que está dentro da área, reservas suspensas e subterrâneas, splitters, caixas e fusões), **Caixas** com portas usadas e livres, e o sinal dos clientes.

- **Planilha (CSV)**: baixa um arquivo que abre direto no Excel (separador `;`).
- **Imprimir / PDF**: abre a impressão do navegador. Para PDF, escolha **Salvar como PDF** como impressora.

---

## 15. Tabela de postes

Barra lateral → **Tabela de postes**.

- A tabela lista todos os postes com **Poste**, **Código**, **Material** (Concreto, Madeira, Metálico, Fibra de
  vidro), **Altura (m)**, **Esforço (daN)**, **Proprietário**, **Estrutura** e os **Cabos** que passam nele.
- Edite direto na tabela (o valor salva ao sair do campo ou com **Enter**).
- **Buscar por nome, código ou proprietário** filtra a lista.
- O ícone de alvo (**Ver no mapa**) leva até o poste.

**Importar postes da distribuidora (BDGD/ANEEL ou qualquer planilha)**

1. Salve a planilha em **CSV** (separador `;` ou `,`).
2. Ela precisa das colunas **latitude** e **longitude** (também aceita `lat`/`lng`/`lon`/`x`/`y`). Opcionais:
   **nome**, **codigo** (ou `cod_id`), **material** (ou `tip_mat`), **altura_m**, **esforco_dan**, **proprietario**,
   **estrutura**.
3. Clique em **Importar planilha** e escolha o arquivo. Os postes aparecem no mapa.
4. **Exportar CSV** baixa a tabela atual.

> Para a BDGD: no portal de dados abertos da ANEEL, baixe a base da sua distribuidora, filtre a camada de postes
> da região e exporte em CSV com as coordenadas em graus decimais (WGS84).

---

## 16. Viabilidade

Serve para responder rápido "dá para atender este endereço?".

1. Escolha **Viabilidade** na barra de ferramentas.
2. Digite o **Endereço do cliente** no painel e escolha o resultado, ou clique no local no mapa (ou em cima de um
   cliente já cadastrado).
3. Ajuste o **Raio de atendimento** (50 a 1000 m).
4. O painel mostra **Viável** (quantas CTOs têm porta livre no raio) ou **Inviável** (sem CTO no raio, ou CTOs sem
   porta livre).
5. A lista mostra cada CTO com a **distância**, as **portas livres** e a **potência prevista** na melhor saída de
   splitter. No mapa, linhas tracejadas ligam o ponto às CTOs. Clique numa CTO da lista para ir até ela.

A distância é em linha reta e a potência é na saída do splitter (sem o drop).

---

## 17. OTDR virtual

Use para comparar com a medição do OTDR de campo e achar onde está um problema.

1. Clique num cliente que já tenha sinal e depois em **Simular OTDR / localizar evento**.
2. A janela mostra a **curva esperada** do percurso OLT → cliente (com reserva técnica) e a tabela de **eventos**
   (conectores, fusões, splitters) com distância, perda e potência.
3. Em **Distância do evento medida no OTDR (m)**, digite a distância que o aparelho mostrou (ex.: 845).
4. Clique em **Mostrar no mapa**. O sistema marca um ponto vermelho no lugar exato do trajeto e destaca o caminho em
   laranja.
5. **Limpar marcação** (rodapé do mapa) apaga a marca.

---

## 18. KMZ e KML

**Importar** (barra lateral → **Importar KMZ/KML**)

1. Escolha um arquivo `.kmz` ou `.kml` (por exemplo, do Google Earth).
2. Os pontos viram caixas conforme o **nome do ponto ou da pasta**: *CTO* ou *caixa de atendimento* → CTO; *CEO* ou
   *emenda* → CEO; *POP*, *OLT* ou *datacenter* → POP; *condomínio*, *edifício* ou *residencial* → Condomínio; *poste* → Poste; *cliente*, *ONU* ou *assinante* → Cliente.
3. As linhas viram cabos. Se o nome tiver a quantidade de fibras (ex.: *12FO*, *24 fibras*) ela é usada; *backbone*
   ou *tronco* define o tipo. As pontas dos cabos se ligam às caixas que estiverem a até **15 m**.
4. Ao final aparece quantos pontos e cabos foram importados.

Dica: no Google Earth, organize as pastas com nomes como *CTOs*, *CEOs*, *Postes*, *Clientes* antes de exportar.

**Exportar** (barra lateral → **Exportar KMZ**): baixa o projeto inteiro em KMZ, com pastas por tipo e cores, para
abrir no Google Earth.

---

## 19. Equipe e permissões

Barra lateral → **Equipe**.

**Adicionar alguém**

1. A pessoa precisa **ter criado uma conta** no MapFTTH.
2. Em **Adicionar pessoa**, digite o **e-mail da conta MapFTTH** dela, escolha o papel e clique no botão de adicionar (ícone de pessoa com +).
3. O projeto passa a aparecer em **Meus projetos** dela, como *Compartilhado por...*.

**Papéis**

| Papel | O que pode fazer |
| --- | --- |
| **Dono** | Controle total, inclusive excluir o projeto. |
| **Administrador** | Edita a rede, gerencia a equipe e as Configurações. |
| **Projetista** | Edita mapa, caixas, cabos e fusões. |
| **Técnico (leitura)** | Consulta mapa, diagramas e relatórios. Só tem as ferramentas Selecionar, Régua e Viabilidade e não salva alterações. |

Dono e administradores mudam o papel pela lista ou removem pessoas (ícone ao lado do nome). Qualquer membro pode
sair do projeto pelo mesmo ícone no próprio nome.

---

## 20. Histórico

- **Do projeto inteiro**: barra lateral → **Histórico**.
- **De um elemento**: selecione a caixa ou o cabo e clique no **relógio** ao lado de *Salvar alterações*.

Cada criação, alteração, movimentação e edição de diagrama aparece com o autor, a data e o que mudou.

---

## 21. Configurações do projeto

Barra lateral → **Configurações**.

**Motor de mapas** (todos os usuários): escolha **OpenStreetMap** (padrão), **Esri (ArcGIS)** ou **Google Maps**
(este só com a chave configurada, veja a [seção 4](#4-a-tela-do-mapa)). A troca vale na hora e fica salva neste
navegador. Embaixo da lista aparece de onde vem cada estilo (Satélite, Ruas, Relevo) no motor escolhido.

**Projeto** (só dono e administradores): **Nome do projeto**, **Cidade** e os **parâmetros do orçamento óptico**:

| Parâmetro | Padrão |
| --- | --- |
| Potência padrão da OLT | 5,0 dBm |
| Atenuação da fibra | 0,35 dB/km |
| Perda por fusão | 0,10 dB |
| Perda por conector | 0,50 dB |
| Potência máxima na ONU | −8 dBm |
| Limite de atenção na ONU | −25 dBm |
| Sensibilidade mínima da ONU | −27 dBm |

Ao salvar, todos os sinais, cores e relatórios são recalculados.

---

## 22. Atalhos e dicas

| Tecla / ação | Onde | Efeito |
| --- | --- | --- |
| **Esc** | Mapa | Cancela o cabo, a área ou a régua e volta para Selecionar. |
| **Enter** | Mapa | Finaliza o cabo ou a área em desenho. |
| **Duplo clique** numa caixa | Mapa | Abre o diagrama de fusão / editor do POP. |
| **Duplo clique** em poste, cliente ou cabo | Mapa | Abre o painel de edição no campo Nome. |
| **Arrastar** elemento | Mapa | Move o elemento e os cabos ligados a ele. |
| **Enter** / **Esc** ao soltar | Mapa | Confirma ou cancela o novo lugar do elemento arrastado. |
| **Ctrl+Z** | Mapa | Desfaz o último movimento de elemento. |
| **Arrastar** alça do cabo | Mapa | Move ou cria um ponto do traçado (botão direito remove). |
| **Botão direito** desenhando cabo | Mapa | Desfaz o último ponto. |
| **Botão direito** no cabo | Mapa | Menu: Editar, Conectar a caixa, poste ou POP, Conectar caixas no traçado, Excluir. |
| **Esc** no modo conectar | Mapa | Sai do modo (mesmo que **Concluir**). |
| **Delete** | Diagrama | Remove a fusão ou o bloco selecionado. |
| **Esc** | Diagrama | Cancela a porta selecionada. |
| **Rolar o mouse** | Diagrama | Zoom. |
| **Ctrl+Z** | Editor do POP | Desfaz a última alteração. |
| **Delete** | Editor do POP | Remove o cordão ou a conexão selecionada. |
| **Esc** | Editor do POP | Cancela a porta selecionada e apaga o Traço VFL. |
| **Arrastar** o cabeçalho do card | Editor do POP | Move o card; arrastar o fundo move a vista. |

- Monte a rede **do POP para o cliente**: cabos primeiro, depois POP, CEOs, CTOs e por último os drops. Assim o
  sinal aparece em cada porta enquanto você funde.
- Use o **status** (*Em projeto* → *Implantado* → *Certificado*) para acompanhar a obra; a barra de % implantado e
  o dashboard usam esses valores.
- Antes de uma visita técnica, exporte o **unifilar PNG** da caixa e o **relatório da área** em PDF.
