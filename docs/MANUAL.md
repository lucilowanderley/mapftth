# Manual de uso do MapFTTH

Este guia mostra, passo a passo, como usar cada função do MapFTTH: do cadastro até a rede pronta, com fusões,
orçamento óptico, relatórios e equipe. Siga a ordem do **Roteiro rápido** na primeira vez; depois use as
seções como consulta.

## Sumário

1. [Roteiro rápido: da conta ao primeiro cliente com sinal](#1-roteiro-rápido)
2. [Conta e login](#2-conta-e-login)
3. [Meus projetos](#3-meus-projetos)
4. [A tela do mapa](#4-a-tela-do-mapa)
5. [Adicionar POP, CEO, CTO, poste e cliente](#5-adicionar-pop-ceo-cto-poste-e-cliente)
6. [Desenhar e editar cabos](#6-desenhar-e-editar-cabos)
7. [Editor do POP: OLT e DIO](#7-editor-do-pop-olt-e-dio)
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
5. Abra o **Editor do POP**: adicione uma **OLT** e um **DIO**, ligue a porta PON da OLT ao DIO e o DIO à fibra 1
   do cabo ([seção 7](#7-editor-do-pop-olt-e-dio)).
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
| **Barra de ferramentas (topo)** | Selecionar, CTO, CEO, POP, Poste, Cliente, Cabo, Área, Régua, Viabilidade. |
| **Painel de camadas (direita)** | Mapa base e os elementos visíveis. |
| **Dica (rodapé do mapa)** | Explica o que fazer com a ferramenta escolhida e mostra botões como **Finalizar cabo** e **Finalizar área**. |

**Mapa base** (painel da direita): **Satélite** (Esri), **Ruas** (OpenStreetMap) ou **Escuro** (Esri). Nenhum
precisa de chave. O zoom vai até 21; acima do zoom máximo de cada mapa a imagem é ampliada.

**Camadas** (painel da direita): ligue e desligue **POPs, CEOs, CTOs, Postes, Clientes**, **Cabos backbone,
distribuição e drop**, **Áreas** e **Rótulos** (nomes). Os nomes das caixas aparecem a partir do zoom 17 (o POP
aparece sempre).

**Buscar** (barra lateral): digite parte do nome de uma caixa, cliente ou cabo e clique no resultado; o mapa vai
até ele e já o seleciona.

**Régua**: escolha **Régua** e clique nos pontos do trajeto. A distância total aparece na dica do rodapé.
**Esc** limpa a medição.

---

## 5. Adicionar POP, CEO, CTO, poste e cliente

1. Na barra de ferramentas, escolha **POP**, **CEO**, **CTO**, **Poste** ou **Cliente**.
2. Clique no mapa onde o elemento fica. Ele é criado na hora com um nome automático e o painel de edição abre
   à esquerda. Você pode continuar clicando para colocar vários do mesmo tipo.
3. Volte para **Selecionar** (ou aperte **Esc**) quando terminar.

**Editar um elemento**: com **Selecionar**, clique nele. No painel:

- **Nome**, **Status** (*Em projeto*, *Não implantado*, *Implantado*, *Certificado*) e **Observações**.
- **Cliente**: campo **Endereço**, potência na ONU e os botões de drop e OTDR ([seção 9](#9-ligar-o-cliente-e-ver-o-sinal)).
- **Poste**: **Código / plaqueta**, **Material**, **Altura (m)**, **Esforço (daN)**, **Distribuidora / proprietário**
  e a lista de **cabos neste poste**.
- **POP, CEO e CTO**: botão **Editor do POP** ou **Diagrama de fusão**.
- Clique em **Salvar alterações**. A lixeira exclui; o relógio mostra o histórico daquele elemento.

**Mover**: com **Selecionar**, arraste a caixa. As pontas dos cabos ligados a ela acompanham e o comprimento é
recalculado.

**Atalho**: dê **duplo clique** numa CTO, CEO ou POP para abrir direto o diagrama.

---

## 6. Desenhar e editar cabos

**Desenhar**

1. Escolha **Cabo** na barra de ferramentas.
2. Clique na **caixa de origem** (ex.: o POP). Se clicar no mapa vazio, o cabo começa com a ponta solta.
3. Clique no mapa para criar os **pontos do trajeto** (as curvas pela rua ou pelos postes).
4. Clique na **caixa de destino** (ex.: a CEO ou CTO) para terminar. Também dá para terminar com **Enter** ou com
   o botão **Finalizar cabo (metragem)** no rodapé.
5. **Esc** cancela o desenho.

O cabo nasce como **Cabo 12FO** de distribuição. Se uma das pontas for um cliente, ele vira **Cabo Drop 1FO**.

**Editar** (clique no cabo com **Selecionar**):

- **Modelo do catálogo**: Drop 1FO e 2FO, 6FO, 12FO, 24FO, 36FO (distribuição), 48FO, 72FO e 144FO (backbone), ou
  **Personalizado**. Escolher um modelo já preenche nome, fibras, fibras por tubo, tipo e cor.
- **Fibras** e **Fibras/tubo**: as cores seguem o padrão **ABNT** (verde, amarelo, branco, azul, vermelho,
  violeta, marrom, rosa, preto, cinza, laranja, água-marinha). Acima de 12 fibras o diagrama mostra também a cor
  do tubo.
- **Tipo** (Backbone, Distribuição, Drop) e **Status**. Cabos *Em projeto* aparecem tracejados no mapa.
- **Reserva técnica (m)**: somada ao comprimento geométrico no **Total** (e usada no orçamento óptico e nos
  relatórios).
- **Cor no mapa** e **Espessura**.
- **Salvar alterações**. Se você reduzir o número de fibras, as fusões das fibras que sobrarem são removidas
  (o sistema pergunta antes). Excluir o cabo também remove as fusões dele nas caixas.

---

## 7. Editor do POP: OLT e DIO

Selecione o POP e clique em **Editor do POP** (ou duplo clique no POP). Os cabos que saem do POP já aparecem como
blocos, com as fibras coloridas.

**Adicionar a OLT**

1. Clique em **OLT**.
2. Escolha o **Modelo** (Huawei MA5608T, V-Sol 8 portas, ZTE C320) ou **Configuração personalizada**.
3. Ajuste **Nome**, **Slots**, **PON/slot** e **TX (dBm)** (potência de saída; o padrão vem das Configurações).
4. Clique em **Criar OLT**. As portas aparecem como *slot/porta* (ex.: 1/3).

**Adicionar o DIO**

1. Clique em **DIO** e escolha o tamanho: **12, 24, 36, 48, 72 ou 144** portas.
2. Clique em **Criar DIO com N portas**.
3. O DIO tem dois lados: o **esquerdo** recebe o cordão da OLT (conector) e o **direito** é fundido com o cabo.

**Fazer as ligações**

1. Clique numa **porta PON da OLT** e depois na porta do **lado esquerdo do DIO**.
2. Para ligar o DIO ao cabo, clique numa porta do **lado direito do DIO** e depois numa **fibra do cabo**.
3. Para ligar várias fibras de uma vez, use **Auto-fusão** ([seção 8](#auto-fusão)) com o cabo como origem e o
   DIO como destino.
4. Clique em **Salvar e sair** (ou **Aplicar** para salvar e continuar).

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

Para remover um splitter, OLT ou DIO, selecione o bloco e clique em **Remover**. Num bloco de cabo, **Remover** apaga
só as fusões desse cabo nesta caixa (o cabo em si se exclui no mapa).

<a id="auto-fusão"></a>
**Auto-fusão** (sangria e emendas em sequência)

1. Clique em **Auto-fusão**.
2. Escolha o **Cabo de origem** e o **Destino** (outro cabo ou um DIO).
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

No **Editor do POP** ou no **Diagrama de fusão**, clique em **PNG** (canto superior direito). O arquivo baixa com o
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

O relatório traz **Elementos** (quantidade por tipo e status), **Lista de materiais** (cabos por modelo com reserva
técnica proporcional, splitters, caixas e fusões), **Caixas** com portas usadas e livres, e o sinal dos clientes.

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
   *emenda* → CEO; *POP*, *OLT* ou *datacenter* → POP; *poste* → Poste; *cliente*, *ONU* ou *assinante* → Cliente.
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

Barra lateral → **Configurações** (só dono e administradores). Aqui você muda **Nome do projeto**, **Cidade** e os
**parâmetros do orçamento óptico**:

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
| **Arrastar** caixa | Mapa | Move a caixa e as pontas dos cabos. |
| **Delete** | Diagrama | Remove a fusão ou o bloco selecionado. |
| **Esc** | Diagrama | Cancela a porta selecionada. |
| **Rolar o mouse** | Diagrama | Zoom. |

- Monte a rede **do POP para o cliente**: cabos primeiro, depois POP, CEOs, CTOs e por último os drops. Assim o
  sinal aparece em cada porta enquanto você funde.
- Use o **status** (*Em projeto* → *Implantado* → *Certificado*) para acompanhar a obra; a barra de % implantado e
  o dashboard usam esses valores.
- Antes de uma visita técnica, exporte o **unifilar PNG** da caixa e o **relatório da área** em PDF.
