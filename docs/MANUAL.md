# Manual de uso do MapFTTH

Este guia mostra, passo a passo, como usar cada função do MapFTTH: do cadastro até a rede pronta, com fusões,
orçamento óptico, relatórios e equipe. Siga a ordem do **Roteiro rápido** na primeira vez; depois use as
seções como consulta.

## Sumário

1. [Roteiro rápido: da conta ao primeiro cliente com sinal](#1-roteiro-rápido)
2. [Conta e login](#2-conta-e-login)
3. [Meus projetos](#3-meus-projetos)
4. [A tela do mapa](#4-a-tela-do-mapa)
5. [Adicionar POP, datacenter, torre, CEO, CTO, caixa, poste, cliente e condomínio](#5-adicionar-pop-datacenter-torre-ceo-cto-caixa-poste-cliente-e-condomínio) (inclui a [Caixa de parede ou subterrânea](#caixa-de-parede-ou-subterrânea), a [Fixação da CTO/CEO](#fixação-da-ctoceo-poste-parede-ou-caixa), o [Fixar em massa](#fixar-em-massa), os [Objetos fixados no poste/caixa e o editor do poste/caixa](#objetos-fixados-no-postecaixa-e-o-editor-do-postecaixa) e a [Câmera: IP, analógica e DVR/NVR](#câmera-ip-analógica-e-dvrnvr))
6. [Desenhar e editar cabos](#6-desenhar-e-editar-cabos) (inclui as [3 formas de ligar a CTO no cabo](#ligar-a-cto-no-cabo-3-formas) e o [Lançar cabo](#lançar-cabo-com-postes-e-reservas))
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
| **Barra de ferramentas (topo)** | Selecionar, CTO, CEO, Caixa, POP, Datacenter, Torre, Poste, Cliente, Condomínio, Câmera, Cabo, Lançar (lançar cabo), Fixar (fixar em massa), Área, Reserva, Régua, Viabilidade. |
| **Painel de camadas (direita)** | Mapa base e os elementos visíveis. |
| **Dica (rodapé do mapa)** | Explica o que fazer com a ferramenta escolhida e mostra botões como **Finalizar cabo** e **Finalizar área**. |

Quando um painel abre à esquerda do mapa (propriedades do objeto, **Lançar**, **Fixar**, **Viabilidade** ou uma área), a barra de
ferramentas se afasta para a direita dele, para nunca ficar coberta; se não couber numa linha, ela quebra em duas. Ao
fechar o painel, ela volta ao centro. Se você arrastou a barra para outro lugar, ela fica onde você deixou.

A barra de ferramentas e o painel de camadas podem ser arrastados para outro lugar destravando o **cadeado** (veja
**Cadeado** mais abaixo).

**Mapa base** (painel da direita): clique em **Satélite**, **Ruas** ou **Relevo**. Abaixo dos botões aparece o
**motor** de mapas em uso. O motor é escolhido em **Configurações** ([seção 21](#21-configurações-do-projeto)) e o
padrão é o **OpenStreetMap**. O sistema lembra o último estilo e o último motor escolhidos neste navegador, mesmo
depois de fechar ou apertar F5.

| Motor | Satélite | Ruas | Relevo | Chave? |
| --- | --- | --- | --- | --- |
| **OpenStreetMap** (padrão) | Imagens da Esri (o OpenStreetMap não tem satélite) | OpenStreetMap | OpenTopoMap | Não precisa |
| **Esri (ArcGIS)** | World Imagery | World Street Map | World Topo Map | Não precisa |
| **Google Maps** | Google Satélite | Google Mapa | Google Relevo | Precisa de chave (abaixo); sem ela aparece apagado |

O zoom vai até 21; acima do zoom máximo de cada mapa a imagem é ampliada.

**Último enquadramento**: cada projeto reabre na mesma posição e no mesmo zoom em que você deixou o mapa (fica
salvo neste navegador). Na primeira vez em um navegador, o mapa abre no centro e no zoom definidos ao criar o projeto.

Se algum quadrado do mapa base não carregar (internet lenta ou servidor de mapas ocupado), o sistema tenta de novo
sozinho algumas vezes. Se continuar faltando, mova um pouco o mapa ou troque o motor em **Configurações**.

> **Mapas do Google**: o Google só permite usar os mapas dele com uma chave da **Map Tiles API** (o uso direto dos
> tiles, sem chave, é proibido pelos termos do Google). Para conseguir a chave: no Google Cloud Console crie um
> projeto, ative a cobrança e a **Map Tiles API**, crie uma chave de API e restrinja-a ao endereço do sistema
> (restrição por site HTTP, ex.: `https://mapftth.seudominio.com.br/*` e, no Laragon, `http://mapftth.test/*`).
> Depois, o **dono do projeto** abre **Configurações**, clica em **Cadastrar chave do Google**, cola a chave e clica
> em **Testar e salvar**. O sistema testa a chave no Google antes de salvar; ela fica **criptografada** no banco e
> vale para **todos os projetos de que você é dono** (os membros da equipe usam a chave do dono ao abrir o projeto).
> Em seguida o motor muda para **Google Maps**. **Trocar chave** e **Remover** ficam no mesmo lugar.
> Alternativa para o servidor inteiro: `GOOGLE_MAPS_KEY=sua-chave` no `.env` (rode `php artisan config:cache`; no
> Laragon, `php artisan config:clear`); ela vale para quem não cadastrou chave própria. O Google dá uma cota mensal
> gratuita e cobra acima dela. Com o Google, o canto do mapa mostra **Google** e os créditos das imagens da área
> visível, como o Google exige. Se a chave for recusada, o sistema avisa o motivo e volta para o OpenStreetMap.

**Elementos** (painel da direita): a lista fica recolhida; clique na **seta para baixo** ao lado de **Elementos**
para abri-la flutuando abaixo do painel (clique de novo, fora dela ou tecle Esc para fechar). Nela você liga e
desliga **Datacenters, POPs, Torres, CEOs, CTOs, Condomínios, Postes, Clientes**, **Cabos backbone, distribuição e
drop**, **Áreas**, **Enlaces wireless**, **Rótulos** (nomes) e **Confirmar ao mover**. Os nomes das caixas aparecem a partir do zoom 17 (o POP
aparece sempre).

**Cadeado (mover as caixas)**: a barra de ferramentas e o painel da direita têm um **cadeado** no canto superior
direito. Com o cadeado **fechado** (padrão) a caixa fica fixa. Clique nele para **abrir**: o cadeado fica amarelo, a
borda da caixa também, e você pode **arrastar a caixa** para outro lugar do mapa (segure em qualquer ponto dela,
até sobre um botão, e arraste). Clique de novo para fechar e fixar na nova posição. Ao lado do cadeado aparece
a **seta circular** (Posição padrão), que devolve a caixa ao lugar original; ela só funciona com o cadeado **aberto** (com o cadeado fechado
fica apagada, para a caixa não sair do lugar sem querer). A posição e o cadeado ficam salvos
neste navegador (valem para todos os projetos), e a caixa nunca sai da área do mapa, mesmo ao diminuir a janela.
Quando a barra de ferramentas é movida, os avisos e os campos que aparecem logo abaixo dela vão junto. Se o painel
da direita for levado para a metade de baixo da tela, a lista de **Elementos** abre para cima.

**Buscar** (barra lateral): digite parte do nome de uma caixa, cliente ou cabo e clique no resultado; o mapa vai
até ele e já o seleciona. Também aceita coordenadas, como `-8.0476, -34.8770` (formato do Google Maps) ou
`8°03'12"S 34°52'37"W`: clique em **Ir para coordenada** e o ponto fica marcado no mapa (**Limpar marcação** tira).

**Régua**: escolha **Régua** e clique nos pontos do trajeto. A distância total aparece na dica do rodapé.
**Esc** limpa a medição.

### Agrupar objetos no mapa

Para deixar o mapa mais limpo, você pode **recolher tudo o que está à frente de um objeto** e mostrar
só ele:

1. Com **Selecionar**, clique no POP, CEO, CTO (ou outro objeto) no mapa.
2. No painel do objeto, clique em **Agrupar objetos à frente**.
3. Somem do mapa todos os objetos e cabos que vêm depois dele pelos **cabos de saída e derivações** (CTOs, CEOs,
   clientes, drops, reservas e enlaces desses objetos). O cabo que **chega** no objeto continua visível.
4. O ícone do objeto ganha um **anel amarelo tracejado** e um **selo** com a quantidade de objetos ocultos
   (por exemplo **+12**).

Para mostrar tudo de novo, selecione o objeto agrupado e clique em **Desagrupar** (o botão mostra quantos estão
ocultos). O ícone volta ao normal e os objetos voltam a ser desenhados.

- O que fica "à frente" é calculado pelos cabos a partir do POP, Datacenter ou Torre mais próximo, então não importa
  o sentido em que o cabo foi desenhado. Em anel, o grupo não volta para o lado de cima. Numa rede ainda sem POP,
  o cabo de chegada é o que **termina** no objeto.
- Os membros não ficam gravados: o que você ligar depois à frente entra no grupo sozinho.
- Poste ou caixa com CTO/CEO fixada contam como um ponto só: agrupar o poste segue os cabos da CTO/CEO fixada nele
  (e vice-versa), e o selo aparece no poste/caixa.
- Dá para ter vários grupos ao mesmo tempo, inclusive um dentro do outro.
- Agrupar muda só a visualização: nada é apagado e não aparece no histórico. Fica salvo **neste navegador**, por
  projeto (outro computador ou outro usuário vê o mapa sem os grupos).

---

## 5. Adicionar POP, datacenter, torre, CEO, CTO, caixa, poste, cliente e condomínio

1. Na barra de ferramentas, escolha **POP**, **Datacenter**, **Torre**, **CEO**, **CTO**, **Caixa**, **Poste**, **Cliente**, **Condomínio** ou **Câmera**.
2. Clique no mapa onde o elemento fica. Ele é criado na hora com um nome automático e o painel de edição abre
   à esquerda. Você pode continuar clicando para colocar vários do mesmo tipo.
3. Volte para **Selecionar** (ou aperte **Esc**) quando terminar.

**Inserir por coordenadas**: com a ferramenta do elemento escolhida, aparece abaixo da barra de ferramentas o painel
**(Elemento) por coordenadas**. Digite **Latitude** e **Longitude** e clique em **Adicionar** (ou Enter). O mapa vai
até o novo elemento. Aceita graus decimais com ponto ou vírgula (`-8.0476` ou `-8,0476`) e graus/minutos/segundos
(`8°03'12"S`; use S/W/O para sul e oeste). Se colar o par inteiro, como `-8.0476, -34.8770`, no campo Latitude,
os dois campos são preenchidos.

**Editar um elemento**: com **Selecionar**, clique nele. **Duplo clique** abre o editor direto: na CTO, CEO ou POP
(e no condomínio) abre o diagrama de fusão / editor do POP; no **poste** e na **caixa** abre o editor do poste/caixa
(objetos fixados nele); no cliente coloca o cursor no campo **Nome** do painel. No painel:

- **Nome**, **Status** (*Em projeto*, *Não implantado*, *Implantado*, *Certificado*) e **Observações**.
- **Posição**: latitude e longitude do elemento. Digite os valores exatos (mesmos formatos aceitos acima) e salve
  para reposicionar com precisão. O ícone de mira centraliza o mapa no elemento e o ícone de copiar copia
  `latitude, longitude` para colar em outro programa.
- **Cliente**: campo **Endereço**, **Tipo de cliente** (residencial, empresarial ou corporativo, com ícone de casa,
  loja ou prédio no mapa), **ID do cliente**, **Serial ONU/ONT** e **Sinal medido** (para integração com outros
  sistemas), potência estimada na ONU, a **saúde do sinal** (medido × estimado, com o trecho provável do problema;
  veja a seção 8, *Cliente no diagrama*) e os botões de drop e OTDR ([seção 9](#9-ligar-o-cliente-e-ver-o-sinal)).
- **Poste**: **Código / plaqueta**, **Material**, **Altura (m)**, **Esforço (daN)**, **Distribuidora / proprietário**,
  a lista de **cabos neste poste** e as CTO/CEO **fixadas neste poste**. No mapa o poste é um círculo cinza com a
  haste, a cruzeta e os isoladores desenhados (na barra de ferramentas, o botão **Poste** tem o mesmo desenho).
  O botão **Editor do poste** (ou duplo clique no poste) abre a tela com tudo o que está fixado nele
  ([veja abaixo](#objetos-fixados-no-postecaixa-e-o-editor-do-postecaixa)).
- **CTO e CEO**: campo **Fixada em** (*Poste*, *Parede*, *Caixa* ou *Cabo*); veja
  [Fixação da CTO/CEO](#fixação-da-ctoceo-poste-parede-ou-caixa).
- **Caixa**: **Tipo** (*Parede* ou *Subterrânea*), **Local** (*Externa* ou *Interna*), **Modelo / tamanho**,
  **Endereço** e a lista de **CTO / CEO dentro da caixa** ([veja abaixo](#caixa-de-parede-ou-subterrânea)).
- **Condomínio**: **Tipo** (*Casas* ou *Prédios*), número de **Casas** ou **Apartamentos**, **Quadras** ou
  **Prédios / torres**, **Andares** (só prédios), **Endereço**, **Síndico / contato** e **Telefone**.
- **Torre**: **Tipo de torre** (autoportante, estaiada, monopolo, mastro ou rooftop), **Altura (m)**, **Código do site**,
  **Detentora / proprietário**, **Endereço** e **Tem shelter / abrigo com racks**.
- **Torre e POP**: lista de **Equipamentos wireless** ([veja abaixo](#torre-e-equipamentos-wireless)).
- **POP, datacenter, torre, CEO, CTO e condomínio**: botão **Editor do POP**, **Editor do Datacenter**,
  **Shelter da torre (racks)** ou **Diagrama de fusão**.
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

### Caixa de parede ou subterrânea

1. Escolha **Caixa** na barra de ferramentas. Abaixo dela aparece **Caixa: Parede | Subterrânea** e
   **Externa | Interna**; escolha antes de clicar no mapa.
2. Clique no mapa. A caixa é criada como *CX-1*, *CX-2*... com ícone roxo-azulado: a subterrânea mostra a tampa com
   grelha e a de parede mostra a caixa presa numa parede hachurada.
3. No painel, confira o tipo e o local, preencha **Modelo / tamanho** (sugestões R1, R2, R3, quadro de parede...) e o
   **Endereço**. Caixa **de parede** ou **interna** fica num imóvel: o endereço é obrigatório para salvar.

A caixa tem tudo o que a CTO/CEO tem: o cabo pode terminar nela ou passar por ela em **sangria** (e pela opção
**Conectar caixas no traçado**), ela tem **Diagrama de fusão** próprio (emendas, splitters, bandejas, clientes,
grupos) e entra no orçamento óptico como qualquer caixa. Além disso ela **recebe CTO e CEO dentro dela**:

- Com a ferramenta **CTO** ou **CEO**, clique sobre a caixa; ou, no painel da caixa, use **+ CTO na caixa** /
  **+ CEO na caixa**; ou use o **Editor da caixa**. A CTO/CEO nasce **fixada** na caixa (*Fixada em: Caixa*): o
  ícone dela se funde ao da caixa ([veja abaixo](#objetos-fixados-no-postecaixa-e-o-editor-do-postecaixa)).
- O painel da caixa lista as CTO/CEO que estão dentro; clique numa para ir até ela.
- **Duplo clique na caixa** (ou o botão **Editor da caixa**) abre o editor com tudo o que está dentro; o diagrama de
  fusão da própria caixa abre pelo botão **Diagrama de fusão** do painel ou da barra do editor.
- Ao **mover a caixa** no mapa, as CTO/CEO de dentro vão junto (Ctrl+Z desfaz tudo).
- Nos relatórios a caixa aparece como *Caixa de parede / subterrânea* e no KMZ vai para a pasta *Caixas*.

### Fixação da CTO/CEO: poste, parede, caixa ou cabo

Toda CTO e CEO precisa estar fixada em algum lugar. No painel dela, **Fixada em** tem quatro opções:

- **Poste**: escolha o poste na lista (os mais perto primeiro).
- **Parede**: presa na parede de um imóvel; informe o **Endereço do imóvel** (obrigatório).
- **Caixa**: escolha a caixa na lista. Se a caixa for de parede ou interna (num imóvel), o endereço é obrigatório:
  vale o endereço da caixa, ou digite outro no campo **Endereço do imóvel** da CTO/CEO.
- **Cabo**: presa no cabo (cordoalha), no meio do vão. Escolha o cabo na lista (os que passam a até 40 m, do mais
  perto ao mais longe). Ao salvar, a CTO/CEO vai para cima do traçado do cabo (saindo de um poste, ela anda 8 m pelo
  cabo). Ela continua com ícone próprio no mapa; se ficar a mais de 15 m do cabo (ou o cabo for apagado), aparece o
  ponto âmbar de fixação pendente.

Fixar num **poste** ou numa **caixa** é a mesma coisa que prender a CTO/CEO nele: ela vai para a posição do
poste/caixa, o ícone dela se funde ao dele e ela passa a se mover junto com ele
([veja abaixo](#objetos-fixados-no-postecaixa-e-o-editor-do-postecaixa)). Trocar o poste/caixa na lista e salvar leva
a CTO/CEO para o novo. Fixada na **Parede**, ela tem ícone próprio no mapa e pode ser arrastada.

O jeito mais rápido: com a ferramenta **CTO** ou **CEO**, **clique sobre o poste ou a caixa**; ela já nasce fixada
nele. Clicando no mapa a até 8 m de um poste ou caixa, ela também é fixada sozinha no mais próximo.

CTO/CEO antigas, sem fixação, continuam funcionando normalmente, mas ganham um **ponto âmbar** no canto do ícone, um
aviso no painel e aparecem em **Análise de rede → CTO/CEO com fixação pendente**. O botão **Salvar alterações** da
CTO/CEO só grava depois que a fixação (e o endereço, quando pedido) estiver preenchida.

### Fixar em massa

A ferramenta **Fixar** (barra do mapa, ao lado de **Lançar**) fixa muitos objetos de uma vez, cada um no alvo mais
perto. É útil depois de importar uma rede (por exemplo, a exportação do ISM), quando as CTOs, CEOs e reservas vêm
soltas, perto dos postes, mas sem fixação. O painel à esquerda faz três perguntas:

1. **O que fixar**: CTO, CEO, Reserva técnica, Câmera ou Cabo (traçado).
2. **Onde fixar** (só aparecem os lugares que valem para o objeto escolhido):

   | Objeto | Onde pode fixar |
   | --- | --- |
   | CTO / CEO | Poste, Caixa ou Cabo |
   | Reserva técnica | Poste ou Caixa |
   | Câmera | Poste ou Parede (do cliente, condomínio, POP ou datacenter mais perto) |
   | Cabo | Poste ou Caixa: os vértices do traçado perto de um poste/caixa vão para cima dele |

3. **Distância máxima** (em metros, por exemplo **10 m**): só entra quem tem um alvo a até essa distância. Os botões
   5, 10, 20 e 50 m preenchem o campo; o máximo é 200 m.

Opções:

- **Trocar também os que já estão fixados**: por padrão só entram os objetos **sem fixação**; marcando, os já fixados
  também vão para o alvo mais perto (aparecem com "(trocar)" na lista).
- **Só na área visível do mapa**: limita ao que está na tela (aproxime o mapa no bairro que quer arrumar).
- Para **Cabo**: **Passar também pelos postes perto do traçado** acrescenta um vértice em cada poste que fica ao lado
  do cabo, sem vértice nele. As pontas do cabo ligadas a uma caixa (CTO, CEO, POP...) nunca mudam.

**Prévia**: o painel mostra quantos serão fixados, quantos ficaram **sem alvo** dentro da distância e quantos já
estavam fixados (ignorados). No mapa, uma **linha amarela tracejada** liga cada objeto ao alvo e um anel amarelo marca
o alvo. Na lista, desmarque o que não quer; passe o mouse num item para destacar a linha e clique nele para ver no
mapa. Clique em **Fixar N** (ou **Ajustar N cabos**) para gravar tudo de uma vez.

O resultado é o mesmo da fixação feita um a um: no **poste** ou na **caixa** o objeto vai para a posição dele e o ícone
se funde ao dele (os cabos ligados à CTO/CEO acompanham pela ponta); no **cabo** a CTO/CEO vai para cima do traçado;
na **parede** a câmera fica onde está e passa a contar como instalada no imóvel. Depois de fixar, o botão **Desfazer a
última fixação em massa** volta tudo como estava (enquanto o painel estiver aberto). A ação fica registrada no
**Histórico** ("fixou em massa").

### Objetos fixados no poste/caixa e o editor do poste/caixa

Um poste segura vários objetos: CTO, CEO, câmera e reservas técnicas. Uma caixa guarda CTO, CEO e reservas. Todo
objeto **fixado** num poste ou numa caixa (CTO/CEO com *Fixada em: Poste/Caixa*, câmera com *Fixada em: Poste*)
fica preso nele:

- **Os ícones se fundem**: o objeto não tem ícone próprio no mapa. Ao lado do ícone do poste/caixa aparece uma
  faixa escura com o mini ícone de cada objeto fixado (e das reservas guardadas ali), com **+N** quando há mais de
  quatro. Com rótulos ligados, o nome dos objetos aparece embaixo (ex.: *CTO-07 · CEO-02 · CAM-3*).
- **Não pode ser arrastado**: o objeto fica na posição do poste/caixa e só se move junto com ele. Arraste o poste ou
  a caixa e tudo o que está fixado vai junto, com as pontas dos cabos (Ctrl+Z desfaz). Os campos de latitude e
  longitude do objeto ficam bloqueados.
- **Para mover sozinho é preciso soltar**: no editor do poste/caixa, clique em **Soltar** (no cartão ou na barra);
  ou, no painel da CTO/CEO, troque **Fixada em** para *Parede* (na câmera, troque para *Parede*). O objeto sai um
  pouco para o lado, ganha ícone próprio e pode ser arrastado. Uma CTO/CEO solta fica **sem fixação** (ponto âmbar)
  até você escolher outra parede, poste ou caixa. Os cabos que só passam pelo poste continuam no poste; só as pontas
  dos cabos do próprio objeto acompanham.
- **Cabo num poste com CTO/CEO fixada**: com a ferramenta **Cabo**, clicar no poste liga o cabo na CTO/CEO fixada.
  Com mais de uma, aparece um menu para escolher em qual ligar (ou no próprio poste). Arrastar a ponta ou um ponto do
  meio de um cabo para cima do poste também liga (ou faz a sangria) na CTO/CEO fixada.
- **Agrupar objetos à frente** no poste/caixa (ou na CTO/CEO fixada nele) segue os cabos da CTO/CEO fixada: some
  tudo o que vem depois dela, e o selo **+N** aparece no poste/caixa.
- Câmeras ficam **fixadas em Poste ou Parede**. No poste, o ícone se funde ao dele; na parede, a câmera tem ícone
  próprio, ao lado do imóvel (cliente, condomínio, datacenter ou POP, opcional) e com o endereço.
- CTO/CEO e câmeras antigas que estavam presas num poste/caixa mas com ícone separado foram levadas para cima do
  poste/caixa na atualização (`php artisan migrate`), com as pontas dos cabos delas.

**Editor do poste / Editor da caixa**

Dê **duplo clique no poste ou na caixa** (ou use o botão **Editor do poste** / **Editor da caixa** no painel). Abre
uma tela parecida com o diagrama da CTO, com tudo o que está ali dentro:

- **Poste**: a haste com a **cruzeta no alto**. Logo abaixo da cruzeta, os **cabos de entrada e saída** atravessam o
  poste (cada um na cor dele, preso por uma braçadeira), com o rótulo no mesmo estilo do drop do diagrama: nome em
  negrito, fibras, tipo e se só passa (apoio) ou chega num objeto. Duplo clique no rótulo abre o painel do cabo. Um cabo que entra e sai pelas CTO/CEO do poste (sangria) aparece **uma vez só**, numa linha, com *entra e sai por ...* e a quantidade de trechos.
- **Objetos presos no poste** ficam mais embaixo, abaixo da linha dos cabos, alternando os lados. Eles aparecem
  **recolhidos, como ícones** (como os equipamentos no rack): **um clique abre o cartão** no formato completo (nome,
  tipo, status e resumo: CTO/CEO com cabos, drops, splitters e emendas; câmera com tipo, fabricante, IP, gravador e
  teste) e a setinha do cartão recolhe de novo. **Duplo clique** (no ícone ou no cartão) abre o editor do objeto:
  CTO/CEO abrem o **diagrama de fusão** (ao fechar, você volta para o editor do poste); a câmera abre o painel dela.
- **Drops dos clientes** saem ligados à CTO/CEO de onde partem, com o rótulo no estilo do drop (*nome · metros*) e o
  nome do cliente na ponta. Duplo clique no rótulo abre o drop.
- **CTO/CEO e reservas fixadas no cabo** a até 40 m do poste aparecem **sobre a linha do cabo**, do lado em que
  estão (antes ou depois do poste no traçado), com a distância (*no cabo · 17 m*). Também abrem com um clique e
  editam com duplo clique.
- As **reservas técnicas** fixadas no poste aparecem como ícones de bobina (comprimento e cabo); o cartão tem a
  lixeira para remover.
- **Caixa**: no alto, os cabos que passam ou chegam; embaixo, uma moldura com os cartões dos objetos de dentro.
- Embaixo, **Perto do poste/da caixa, sem fixação**: CTO/CEO (e câmeras, no poste) a até 15 m sem fixação; clique
  para fixar ali.

A **barra de ferramentas** só mostra o que pode ser implantado naquele suporte:

| Botão | O que faz |
| --- | --- |
| **+ CTO**, **+ CEO** | Implanta uma CTO/CEO nova, já fixada no poste/caixa |
| **+ Câmera** (só poste) | Implanta uma câmera fixada no poste (o tipo IP/analógica/DVR é o escolhido na ferramenta Câmera) |
| **+ Reserva** | Reserva técnica de um cabo que passa ali: escolha o cabo, o comprimento, se é suspensa ou subterrânea e onde fica fixada (*Poste*/*Caixa*, ou *Cabo*: no vão, 8 m ao lado) |
| **Abrir** | Abre o objeto selecionado (o mesmo que o duplo clique no cartão) |
| **Soltar** | Solta o objeto selecionado do poste/caixa (ganha ícone próprio e pode ser arrastado). Não vale para os fixados no cabo |
| Lixeira | Remove a reserva selecionada |
| **Diagrama de fusão** (só caixa) | Abre o diagrama de fusão da própria caixa |
| **Dados do poste / da caixa** | Fecha o editor e abre o painel de propriedades do poste/caixa |

**Esc** fecha o editor.

**Datacenter**

Escolha **Datacenter** na barra de ferramentas e clique no mapa. O datacenter é criado como *DC-1*, *DC-2*... com um
ícone verde-azulado de racks. Ele funciona como um POP grande: os cabos chegam nele, e o botão **Editor do
Datacenter** (ou duplo clique) abre o mesmo editor de racks, OLT, DIO e ativos do POP
([seção 7](#7-editor-do-pop-rack-olt-e-dio)), com o endereçamento de rack de datacenter (prédio, andar, sala,
fileira e posição) e a criação de fileiras inteiras. Os racks podem ficar tanto no datacenter quanto no POP.

### Torre e equipamentos wireless

Escolha **Torre** na barra de ferramentas e clique no mapa. A torre é criada como *TR-1*, *TR-2*... com um ícone
vermelho de torre treliçada. No painel, preencha o tipo, a altura e o código do site. Marque **Tem shelter / abrigo
com racks** se houver abrigo: o botão **Shelter da torre (racks)** abre o editor de racks (o mesmo do POP) para os
equipamentos do shelter. A torre também recebe cabos de fibra, como um POP.

**Equipamentos wireless** (na torre e no POP): clique em **Adicionar** e preencha:

- **Tipo**: *Rádio PtP (enlace)*, *Rádio PtMP (base / AP)*, *Antena setorial*, *Antena omni*, *Antena parabólica /
  grade*, *CPE / cliente* ou *Outro*.
- **Nome**, **Fabricante**, **Modelo** e **Frequência (GHz)** (a lista sugere 2,4, 5, 5,8, 11, 18, 23, 60, 80...).
- **Altura na torre (m)**, **Azimute (°)** (0 = norte, sentido horário), **Abertura (°)** do feixe (vazio = a típica
  do tipo, por exemplo 60° na setorial e 90° na base PtMP) e **Tilt (°)**.
- **Enlace com (outra ponta)**: nos rádios PtP, parabólicas e CPEs, escolha a torre ou o POP do outro lado (a lista
  vem do mais perto para o mais longe, com a distância). O **azimute** é calculado sozinho para apontar para lá.
  O quadro abaixo mostra a **distância**, o **azimute até a outra ponta** e a **folga de Fresnel (60%)** no meio do
  enlace, e avisa se o azimute digitado não aponta para a outra ponta. **Apontar para...** recalcula o azimute.

Clique em **Salvar alterações**. No mapa, cada equipamento sem enlace aparece como um **setor colorido** (leque na
direção do azimute com a abertura do feixe; a omni vira um círculo), visível a partir do zoom 13. Cada enlace PtP
aparece com um **estilo próprio**, que não se confunde com cabos nem drops: linha **traço-ponto** sobre uma faixa
larga translúcida, com um **ícone de rádio** (círculo com ondas) no meio. A cor é **rosa** quando as duas pontas têm o
rádio cadastrado e **âmbar** quando só uma tem. Passe o mouse na linha ou no ícone para ver as pontas, a distância e a
frequência. Para esconder setores e
enlaces, desmarque **Enlaces wireless** no painel da direita. Os **relatórios** contam os equipamentos
wireless por tipo e os enlaces PtP.

### Câmera: IP, analógica e DVR/NVR

**Lançar**

1. Escolha **Câmera** na barra de ferramentas. Abaixo dela aparece **Câmera: IP | Analógica | DVR / NVR**; escolha o
   tipo antes de clicar.
   - **IP**: câmera de rede (RJ45/PoE), acessada pelo próprio IP.
   - **Analógica**: câmera coaxial (HDCVI, AHD, HDTVI) gravada num canal de DVR.
   - **DVR / NVR**: o gravador. As câmeras são ligadas aos canais dele.
2. Clique no mapa, ou clique **num poste, cliente, datacenter ou POP**: a câmera já nasce fixada (*Fixada em:
   Poste*, ou *Parede* do imóvel clicado). No **poste** ela fica **fixada** (ícone fundido ao do poste, veja
   [Objetos fixados no poste/caixa](#objetos-fixados-no-postecaixa-e-o-editor-do-postecaixa)); nos outros, é colocada logo ao lado, ligada a
   ele por uma linha fina tracejada.
3. As câmeras recebem o nome *CAM-1*, *CAM-2*... e os gravadores *DVR-1*, *DVR-2*... O ícone é amarelo: câmera
   (corpo com lente) ou gravador (caixa com LEDs).

**Cadastro (painel do objeto)**

- **Tipo**, **Fabricante** (Intelbras, Dahua, Hikvision, HiLook, Axis, Uniview, Genérico ONVIF ou Outro),
  **Modelo**, **Nº de série** e **Alimentação** (PoE, PoE+, 12 Vcc, 24 Vca, solar).
- **Fixada em**: **Poste** (escolha o poste, do mais perto para o mais longe) ou **Parede** (escolha o imóvel,
  opcional: cliente, condomínio, datacenter ou POP, e informe o **Endereço do imóvel**). Ao lado, **Altura (m)**.
- **Conectada na rede por**: a CTO, CEO, cliente (ONU), condomínio, POP, datacenter ou torre por onde a câmera
  chega na rede.
- **Gravador e canal**: na câmera analógica escolha o **Gravador (DVR)** e o **Canal**; numa câmera IP que grava num
  NVR, use **Grava em (NVR/DVR)**. A lista de canais mostra qual câmera já ocupa cada um. No mapa, uma linha amarela
  pontilhada liga a câmera ao gravador.
- **Imagem e campo de visão** (câmeras): **Resolução**, **Lente (mm)**, **IR (m)**, **Direção (°)** (0 = norte,
  sentido horário; também pela régua deslizante), **Abertura (°)** (padrão 90°) e **Alcance (m)** (padrão 30 m).
  Com a direção preenchida, o mapa desenha um **leque amarelo** com o campo de visão (a partir do zoom 15).
- **DVR / NVR**: **Canais** (4, 8, 16, 32, 64), **HD (TB)** e **Gravação (dias)**.
- **Rede e acesso** (IP e DVR): **IP ou DDNS**, **Porta web** (e *Interface web em HTTPS*), **Protocolo** (RTSP, ONVIF
  ou HTTP), **Porta RTSP** (padrão 554), **Porta ONVIF**, **Usuário** e **Senha**, além dos caminhos **RTSP** e
  **da foto**, que já vêm sugeridos pelo fabricante (deixe em branco para usar o padrão).
- A **senha fica criptografada no servidor** (com a chave do sistema) e nunca volta para o navegador: o campo mostra
  *•••••• (guardada)*. Para trocar, digite outra; para tirar, marque **Apagar a senha guardada**. O histórico só
  registra que a senha foi alterada.

**Comunicação com o equipamento real** (quadro **Equipamento**, no alto do painel)

- **Testar comunicação**: o servidor do MapFTTH tenta falar com o equipamento e mostra cada teste com o tempo de
  resposta: **HTTP/HTTPS** (porta web, com o nome do servidor web quando ele informa), **RTSP** (pergunta ao serviço
  de vídeo) e **ONVIF** (quando o protocolo é ONVIF ou a porta ONVIF está preenchida; lê **fabricante, modelo,
  firmware e nº de série** com o usuário e a senha cadastrados). Se o ONVIF trouxer dados novos, **usar no cadastro**
  preenche fabricante, modelo e série. O resultado fica guardado e aparece no mapa como um **ponto no canto do
  ícone**: verde (*Online*) ou vermelho (*Sem resposta*). Só editores e administradores testam.
- **Ver foto**: o servidor busca uma foto atual da câmera (snapshot) com o usuário e a senha guardados e mostra no
  painel. A câmera analógica usa o endereço do DVR e o canal dela. No **DVR**, a lista **Canais** mostra a câmera de
  cada canal (clique no nome para ir até ela), quantos estão em uso e um botão de foto por canal.
- **Interface web**: abre a página de configuração do equipamento numa aba nova, **no seu computador** (funciona
  quando você está na mesma rede da câmera, por VPN ou com a porta liberada).
- **Copiar RTSP**: copia o endereço do vídeo (sem a senha) para abrir no VLC, num NVR ou em outro programa.

**Limites (importante)**: o teste e a foto saem **do servidor onde o MapFTTH está instalado**. Para funcionar, ele
precisa alcançar a câmera: IP público ou DDNS com a porta liberada no roteador, ou uma VPN/rota entre o servidor e a
rede das câmeras. Câmeras só na rede interna do cliente (192.168.x.x) não respondem a um servidor na nuvem. O teste
não usa ping (ICMP), que costuma ser bloqueado nos servidores; ele abre conexão nas portas cadastradas. Nada é
alterado no equipamento: o MapFTTH só lê. Por segurança, o servidor recusa endereços dele mesmo (127.0.0.1) e
link-local (169.254.x.x). Para desligar o acesso às câmeras, coloque `CAMERA_CHECK=false` no `.env`.

**Mover (arrastar)**: com **Selecionar**, clique e arraste qualquer elemento (POP, datacenter, torre, CEO, CTO, poste, cliente, condomínio ou câmera).
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

### Lançar cabo com postes e reservas

A ferramenta **Lançar** (barra do mapa, ao lado de **Cabo**) cria o cabo já passando pelos postes, cria os
postes que faltam e coloca as reservas técnicas fixadas nos postes, tudo de uma vez. Ao escolher a ferramenta abre
um painel à esquerda. No alto do painel escolha o **Tipo** (Backbone ou Distribuição), o **Modelo** (6 a 144 FO),
o **Nome** (opcional) e a **Situação**. O painel tem três jeitos de lançar:

**1. Escolher postes.** O painel lista os postes do projeto, os mais perto primeiro (use a busca para achar pelo
nome). Clique nos postes **no mapa** ou marque na lista, **na ordem** do lançamento: cada poste escolhido ganha um
número e o cabo aparece tracejado ligando um ao outro. **Ordenar** refaz a ordem pelo caminho mais curto a partir do
primeiro, **Inverter** troca o sentido e **Limpar** começa de novo. Clicar de novo num poste escolhido tira ele.

**2. Início e fim.** Informe o **Início** e o **Fim** do lançamento: digite o endereço (escolha na lista que
aparece), cole as coordenadas (ex.: `-8.0476, -34.877`) ou clique no **alfinete** e depois no mapa. Se clicar numa
CTO, CEO, caixa ou POP, o cabo já nasce conectado nela. Deixe marcado **Seguir o percurso da rua, estrada ou
avenida** e clique em **Traçar caminho**. O caminho aparece em cinza no mapa. Então o painel:

- diz quantos **postes já cadastrados** existem no caminho (até 20 m da rua) e deixa **usar os postes que já
  existem**;
- deixa **adicionar os postes que faltam** a cada X metros. Os postes novos ficam nas pontas, nas esquinas e no meio
  dos vãos maiores que essa distância. No mapa eles aparecem como bolinhas brancas e os existentes usados com anel
  amarelo.

Sem **adicionar os postes que faltam**, o cabo segue a rua e passa só pelos postes existentes.

**3. Pontos de referência.** Para quando você quer guiar o percurso: adicione os pontos por onde o cabo deve
passar, **na ordem**. Com **Clique no mapa adiciona ponto** marcado, cada clique no mapa vira um ponto (clicar numa
CTO, CEO, caixa ou POP no primeiro ou no último ponto deixa o cabo conectado nela). Também dá para digitar o endereço
ou colar a coordenada em **Adicionar ponto** e clicar em **+**. O 1º ponto é o início (verde), o último é o fim
(vermelho) e os do meio ficam roxos, numerados no mapa. Na lista, as setas mudam a ordem, o **×** tira o ponto,
**Inverter** troca o sentido e **Limpar** começa de novo. Clique em **Traçar caminho**: o sistema liga cada ponto ao
próximo pelas vias (com a mesma preferência BR, rodovias, estradas, avenidas e ruas) e depois funciona igual ao
**Início e fim**: postes existentes, postes que faltam e reservas. Se o serviço de rotas não responder num trecho,
só aquele trecho fica em linha reta e o painel avisa qual.

**Reserva técnica:** marque **Reserva técnica a cada X m, com Y m**. A cada X metros de cabo o sistema escolhe o
poste mais perto dessa marca e coloca ali uma reserva suspensa de Y metros, **fixada no poste** (anel laranja
tracejado na prévia).

Padrões (o sistema lembra o que você mudar, para cada tipo de cabo):

| Tipo | Distância entre postes | Reserva técnica |
| --- | --- | --- |
| Backbone | 100 m | a cada 500 m, com 15 m |
| Distribuição | 40 m | a cada 500 m, com 15 m |

O resumo mostra a metragem do cabo, a soma das reservas, quantos postes existentes e novos e quantas reservas.
Clique em **Lançar cabo**: o cabo fica selecionado e os postes novos entram no mapa (P-1, P-2...) com a mesma
situação do cabo. Depois disso é um cabo como qualquer outro: dá para editar o traçado, ligar CTOs com as 3 formas
acima e mexer nas reservas.

**Preferência de vias:** o caminho prefere as vias nesta ordem: **BR** (rodovias federais), **rodovias** estaduais
(RN-063, SP-280...), **estradas**, **avenidas** e **ruas**. Cada metro de via tem um peso (BR 1,0; rodovia 1,15;
estrada 1,3; avenida 1,45; rua 1,6) e vence o caminho de menor soma: um caminho um pouco mais longo pela BR ganha de um
mais curto por ruas, mas um desvio grande não compensa. Quando há mais de uma opção, o painel lista até 3
**caminhos** (o primeiro é o recomendado) com a metragem por tipo de via e os nomes das principais (ex.: BR-101,
Avenida Prudente de Morais). Clique num caminho para trocar; o mapa e os postes acompanham.

**De onde vem o caminho:** o servidor do MapFTTH consulta o **OSRM** com os dados de vias do **OpenStreetMap**
(serviço público e gratuito, sem chave), pedindo caminhos alternativos ao perfil de carro e ao perfil a pé. O tipo de
via sai do número e do nome da via no OpenStreetMap. Se o serviço não responder, o caminho fica em **linha reta** e o painel avisa. Confira o caminho no mapa
antes de lançar: em ruas que não estão no OpenStreetMap ele pode dar volta. Quem tiver um servidor OSRM próprio pode
apontar para ele com `ROUTING_URL` no `.env`.

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
- **Fixada em**: no painel do cabo, cada reserva tem o campo **Fixada em**: *Cabo (no vão)*, *Parede* (com o
  endereço do imóvel) ou um dos postes/caixas por onde o cabo passa. Fixada num poste/caixa, ela vai para a posição
  dele, aparece fundida ao ícone dele e se move junto quando ele é arrastado. Reservas antigas a até 3 m de um
  poste/caixa contam como fixadas nele.
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
- **Atenuação (dB/km)**: a atenuação deste cabo no orçamento óptico. Vazio usa a do projeto
  ([seção 21](#21-configurações-do-projeto)). Embaixo aparece a perda total da fibra (comprimento + reservas ×
  dB/km). Valores típicos: 0,35 dB/km em 1310 nm e 0,22 dB/km em 1550 nm.
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

Este mesmo editor abre no **Datacenter** (**Editor do Datacenter**) e no shelter da **Torre** (**Shelter da torre
(racks)**); tudo o que está nesta seção vale para os três.

Selecione o POP e clique em **Editor do POP** (ou duplo clique no POP). O editor abre um **canvas** escuro com
**cards** que você arrasta pelo cabeçalho: um card para cada **cabo** que chega ao POP, e um card para cada **rack**,
**DIO**, **OLT** e **equipamento ativo** que você adicionar. Na primeira vez os cards já vêm organizados (cabos à esquerda,
DIOs no meio, OLTs à direita).

**Barra de ferramentas**

| Botão | O que faz |
| --- | --- |
| **OLT**, **DIO**, **Ativo** | Adicionam um equipamento ao canvas. |
| **Prédio** | Cria a estrutura do datacenter: **Prédio** (com a empresa), **Andar**, **Sala** e **Fileira**. Veja *Estrutura do datacenter* abaixo. |
| **Rack** | Adiciona um rack de piso ou suspenso, com a altura em U (solto no canvas ou dentro de uma fileira). |
| **Cadastro** | Abre o **Cadastro de equipamentos** (fabricante, modelo, portas e altura em U). |
| Contadores | **Rack**, **OLT** e **DIO** (quantidade), **Portas** (portas do DIO com cordão / total) e **PON** (em uso / total). |
| **Localizar rack** | Com mais de um rack, digite o código (ex.: *AJ05* ou *DC1.1A-AJ05*) ou o nome e tecle Enter: a vista vai até o rack, que pisca com borda amarela. |
| **Canvas 2D** / **Manobra** | Alterna entre o canvas com os cards e a tabela de manobra porta a porta. |
| **Cordões** | Mostra ou esconde no canvas os cordões (patch) entre DIO, OLT e ativos. |
| **Traço VFL** | Liga a "caneta de luz vermelha": clique numa porta e veja o caminho aceso. |
| **PNG** | Baixa uma imagem do POP com os cards, vínculos e cordões. |
| ↶ (desfazer) | Desfaz a última alteração (também **Ctrl+Z**). |
| **Salvar** / **Salvar e sair** | Grava o POP (e fecha, no segundo). |
| **Auto-Patch** | Liga automaticamente as portas do DIO que já têm fusão às portas PON livres da OLT. |

No canto inferior direito ficam o **zoom** e o **enquadrar tudo**. Arraste o fundo para mover a vista e use a
roda do mouse para o zoom. O status do POP (*Em projeto*, *Implantado*...) fica ao lado do título.

**Estrutura do datacenter (prédio, andar, sala e fileira)**

Num datacenter com dezenas ou centenas de racks, organize o canvas em níveis, no padrão ANSI/TIA-606:
**Prédio → Andar → Sala → Fileira → Racks**. Cada nível é um objeto que **expande e recolhe**: recolhido, vira um
cartão com o resumo (ex.: *2 andares · 3 salas · 12 fileiras · 140 racks* e o total de U); expandido, vira uma
moldura tracejada com o que tem dentro, arrumado sozinho (andares um embaixo do outro, do mais alto para o subsolo;
salas lado a lado; fileiras empilhadas; racks lado a lado, em ordem de posição).

1. Clique em **Prédio** na barra. Informe a **Empresa** (ex.: *Equinix*, *Ascenty* ou a sua), o **Código** do prédio
   (ex.: *DC1*) e, se quiser, o **Nome do prédio**. Clique em **Criar prédio**.
2. No cabeçalho do prédio clique em **+ Andar**. Escolha o tipo: **Térreo** (código *T*), **Subsolo** (*S1*, *S2*...),
   **Piso** (*1*, *2*...), **Mezanino** (*M*) ou **Cobertura** (*C*). O código pode ser trocado.
3. No andar clique em **+ Sala** (ex.: *A*, *DH2*) ou, se o andar não tem salas, direto em **+ Fileira**.
4. Na sala clique em **+ Fileira** (letras: *A*, *B*... *AJ*). Dá para criar várias de uma vez (ex.: 10 fileiras de A a J).
5. Na fileira clique em **+ Rack**. O endereço vem da estrutura (só a **Posição** é digitada) e o código fica, por
   exemplo, **DC1.1A-AJ05**. Para encher a fileira, use **Criar N rack(s)**.

Detalhes:

- A seta no cabeçalho (ou duplo clique nele, ou um clique no cartão recolhido) **expande/recolhe**. Abrir e fechar
  não conta como alteração; o estado fica salvo junto na próxima vez que você salvar.
- Só o nível de fora (o prédio, ou um espaço solto) é **arrastado** pelo cabeçalho; o que está dentro se arruma
  sozinho. Racks dentro de uma fileira não são arrastados: a ordem é a **posição** (mude editando o rack).
- Os racks **só entram em fileiras**. Pode pular níveis: fileira direto no andar (sem sala) ou até um andar solto.
- Um rack **solto** arrastado para cima de uma fileira entra nela, na próxima posição livre. No **editar rack**, o
  campo **Fileira** troca o rack de fileira ou o deixa **solto no canvas**.
- Mudou o código de um prédio, andar, sala ou fileira? Os racks de dentro passam a usar o novo código (e o nome,
  quando o nome era o próprio código).
- **Excluir** um nível apaga ele e os níveis de dentro; os racks continuam no POP, soltos, com o mesmo endereço.
- Cabos e cordões de equipamentos que estão num espaço recolhido chegam no cartão dele. O **Localizar rack** abre
  sozinho o caminho até o rack achado.
- POP pequeno (um só piso, sem salas nem fileiras)? Não precisa criar estrutura: os racks ficam soltos no canvas,
  como sempre.
- Racks criados antes desta versão, que já tinham **fileira** no endereço, são organizados automaticamente no
  prédio, andar, sala e fileira do endereço ao abrir o editor.

**Rack (piso ou suspenso)**

1. Clique em **Rack** (ou em **+ Rack** numa fileira).
2. Se há estrutura, escolha a **Fileira** (o endereço vem dela) ou deixe **Solto no canvas**. Solto, preencha o
   **Endereçamento no datacenter** (todos os campos são opcionais):
   **Prédio/site** (ex.: DC1), **Andar** (ex.: 1), **Sala** (ex.: A), **Fileira** (letras: A, B... Z, AA, AB...) e
   **Posição** na fileira (1, 2, 3...). O editor monta o **código** no padrão de grade de piso da norma
   ANSI/TIA-606: `prédio.andarSala-FileiraPosição`, com a posição em dois dígitos. Exemplo: **DC1.1A-AJ05** é o
   prédio DC1, andar 1, sala A, fileira AJ, posição 05. Num POP pequeno basta a fileira e a posição (ex.: **A01**).
3. Deixe marcado **Usar o código como nome do rack** (ou desmarque e dê um **Nome** próprio, como *Rack Core*).
4. Escolha a **Instalação**: **Piso** (rack apoiado no chão) ou **Suspenso** (rack de parede).
5. Escolha a **altura em U** (6U a 48U) ou digite outro tamanho. 1U = 44,45 mm.
6. Clique em **Criar rack**.

Ao criar o próximo rack, o endereço já vem preenchido com a mesma sala e fileira do último, na **próxima posição
livre** (há também um link com esse nome para recalcular). Para montar uma fileira inteira de uma vez, informe a
fileira e a posição inicial e mude **Criar 1 rack(s)** para a quantidade (até 50): por exemplo, 10 racks a partir
da posição 1 na fileira B criam **B01** a **B10**, lado a lado no canvas. Se o código já estiver em uso, o editor
avisa antes de criar e o rack repetido aparece com a marca **duplicado** no cabeçalho.

Nas listas de rack (campo **Instalar no rack** da OLT, DIO e Ativo) os racks aparecem em ordem de endereço
(prédio, andar, sala, fileira e posição), agrupados por fileira, e com mais de 8 racks surge um campo para filtrar
pelo código. Racks sem endereço ficam no fim, em **Sem endereço**.

O rack aparece à direita, em **vista frontal**, com as U numeradas de baixo (**U1**) para cima. Cada equipamento
instalado ocupa as suas U e aparece na cor do tipo: **DIO azul**, **OLT roxa** e **ativo verde**. O rodapé mostra
quantas U estão livres.

Há três jeitos de colocar um equipamento no rack:

- Ao criar ou editar uma **OLT**, **DIO** ou **Ativo**, escolha o rack no campo **Instalar no rack**. O editor
  coloca o equipamento na primeira posição livre, de cima para baixo.
- No cabeçalho do rack, clique em **Instalar equipamento** (ícone de caixa com +) e escolha o equipamento.
- Clique numa **U vazia** do rack para instalar um equipamento exatamente ali.

Na janela de instalação você ajusta a **Posição** (a U de baixo) e a **Altura (U)**. A altura vem do modelo
escolhido no cadastro (ou do campo **Altura (U)** do equipamento) e pode ser trocada. O editor não deixa sobrepor dois
equipamentos nem passar do topo do rack.

**Equipamento recolhido e expandido.** Todo equipamento instalado fica **recolhido** dentro do rack: ele aparece só
como uma faixa na cor do tipo, com o nome, o modelo e os mesmos ícones do card (**Matriz de fusão**, **Vincular
cabos**, **Patch**, **Posição no rack**, **Editar**, **Excluir**). Clique na faixa para **expandir**: o card completo,
com as portas, abre ao lado do rack, na altura do equipamento, com uma borda laranja. Clique de novo na faixa (ou no
ícone **Recolher** do card) para recolher. Dá para deixar **até 10 equipamentos expandidos** ao mesmo tempo.

O card expandido pode ser **arrastado** pelo cabeçalho para qualquer lugar do canvas. A posição fica gravada quando
você salva o POP: da próxima vez que expandir, o card abre onde você deixou (o equipamento continua instalado na
mesma U do rack, e a linha do cabo segue da faixa até o card). O rodapé do card mostra onde ele
está (por exemplo *Rack 1 · U40–41*).

**Cabo chegando no rack.** Quando o DIO está no rack, a linha do cabo vinculado chega primeiro na **lateral do
rack**, na altura do DIO, e daí segue para a faixa do DIO. Com o DIO expandido, a linha continua da faixa até o card.
Os cordões de um equipamento recolhido saem da ponta direita da faixa.

Para tirar um equipamento do rack, use **Posição no rack** › **Retirar do rack**: ele volta a ser um card solto no
canvas. Se você diminuir o rack e algum equipamento deixar de caber, a faixa fica com borda vermelha até ser
reposicionada. Excluir o rack não exclui os equipamentos: eles só ficam fora do rack. O rack (com as faixas) também
sai no **PNG** do POP.

**Cadastro de equipamentos**

Clique em **Cadastro** na barra do editor (ou no link **Cadastro de equipamentos** dentro das janelas de OLT, DIO e
Ativo). Há três abas: **OLT**, **DIO** e **Ativos**. Cada uma lista os modelos **padrão** do sistema e os que você
cadastrou. Para cadastrar, clique em **Cadastrar** e preencha:

- **Fabricante** e **Modelo**;
- **OLT**: **Slots**, **PON/slot**, **Uplinks** e **TX dBm**; **DIO**: **Portas**; **Ativo**: **Tipo** e **Portas**;
- **Altura (U)**: quantas unidades de rack o equipamento ocupa;
- **Ativo**: **Grupos de portas** (opcional). Clique em **+ Grupo** e escolha o **Tipo** de porta na lista, separada
  por categoria: **Ethernet (cobre)** (RJ45, ETH 10/100, RJ45 2.5G/5G/10G, RJ45 PoE), **Óptico** (SFP, SFP+, SFP28,
  SFP56, XFP, QSFP+, QSFP28, QSFP56, QSFP-DD, OSFP, CFP), **PON** (GPON, XG-PON, XGS-PON, Combo PON, EPON, 10G-EPON),
  **WDM / transporte** (Canal DWDM, Canal CWDM, Linha / COM, Monitor, Expansão, E1 / TDM) e **Gerência e outros**
  (Gerência (MGMT), Console, USB). Ao escolher o tipo, a **Capacidade** típica dele é preenchida (SFP+ 10G, GPON
  2,5G...) e ainda pode ser trocada (100M a 800G). Para um tipo que não está na lista, escolha **Outro (digitar)...**
  e escreva o nome. Informe também a **Qtd.**. Com grupos, o total de portas é a soma deles e a lista mostra, por exemplo,
  *48×RJ45 1G + 4×SFP+ 10G*.

Os tipos de ativo são Switch, Roteador, BNG / Concentrador, **Servidor**, **Multiplex DWDM**, **Multiplex CWDM**,
Firewall, Nobreak / UPS, Patch panel UTP e Outro. Já vêm prontos modelos padrão de **servidor** (1U e 2U, com portas
RJ45, SFP28/SFP+ e porta de gerência), de **Mux/Demux DWDM** (8 e 40 canais, com porta de linha e de monitor), de
**Mux/Demux CWDM** (18 canais) e de switch/roteador com portas SFP+.

Ao criar uma OLT, um DIO ou um Ativo, escolha o modelo no campo **Modelo (fabricante)**: portas, slots e altura são
preenchidos sozinhos (e ainda podem ser ajustados). O fabricante e o modelo aparecem no card e na faixa do rack.
Seus modelos valem para todos os seus projetos; quem é da equipe de um projeto vê também os modelos do dono do
projeto, mas só pode editar os próprios.

**Foto do equipamento.** No formulário do modelo, clique em **Adicionar foto** e escolha uma foto real do
equipamento (JPG, PNG ou WebP, até 5 MB). A foto aparece em miniatura na lista do cadastro, na busca de modelos e,
ao escolher o modelo na janela de OLT, DIO ou Ativo, logo abaixo do campo **Modelo**. Clique na foto para abrir em
tamanho real. Use **Trocar foto** ou **Remover foto** para mudar. Para pôr foto num modelo **padrão**, edite o
modelo (isso cria a sua versão dele) e adicione a foto. A equipe do projeto vê as fotos dos modelos do dono.

**Editar e excluir modelos.** Todo modelo da lista tem os botões **Editar** (lápis) e **Excluir** (lixeira),
inclusive os **padrão** do sistema:

- Editar um modelo padrão cria a **sua versão** dele (a linha passa a mostrar *padrão editado*). Os equipamentos já
  criados com esse modelo continuam vinculados a ele. O botão **Restaurar** (seta circular) volta ao padrão original.
- Excluir um modelo padrão tira ele da lista para você e para a sua equipe. Embaixo da lista aparece
  *Padrões excluídos: ...* com o link **restaurar** para trazê-lo de volta.
- Excluir um modelo cadastrado por você apaga o modelo. Equipamentos já criados não mudam.

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
card do cabo ao DIO. Cada porta que recebe uma fibra fundida fica **na cor ABNT da fibra** (FO1 verde, FO2
amarela, FO3 branca...) e ganha uma **bolinha na cor do cabo** no canto. Quando a porta também tem cordão na frente
(patch), aparece um **traço claro** na base dela. Porta com cordão mas sem fusão fica **azul**.

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
3. Ajuste **Nome**, **Slots**, **PON/slot**, **TX dBm** (o padrão vem das Configurações), **Uplinks** e a
   **Capacidade** dos uplinks (1G, 10G, 100G...). A miniatura mostra como fica a frente da OLT.
4. Se quiser, configure a **Agregação de portas (LAG)** dos uplinks, a **Gerência** e as **VLANs** (veja
   *Equipamento ativo*, abaixo: funcionam do mesmo jeito; na OLT entram só as portas de uplink).
5. Clique em **Criar OLT**.

A OLT aparece em **vista frontal**: uma linha por slot (**S1**, **S2**...) com as portas PON e uma linha **UP** com
os uplinks. Portas PON com cordão ficam **roxas**; uplinks com cordão ficam **laranja**. Ferramentas do card:
**Patch**, **Editar** e **Excluir**.

**Equipamento ativo**

Clique em **Ativo** para adicionar um switch, roteador, BNG, servidor, multiplex DWDM/CWDM, firewall, nobreak ou
patch panel UTP. As portas do ativo recebem cordões dos **uplinks da OLT** (ou da frente do DIO, em links ponto a
ponto). O ativo não é fonte de sinal PON: o orçamento óptico só conta caminhos que chegam numa porta PON de OLT.
A janela do ativo (e a da OLT) é larga, em três colunas, para quase não precisar rolar: à esquerda modelo, nome,
portas e rack; no meio agregação e gerência; à direita as VLANs.

- **Portas**: o total de portas Ethernet, quando o ativo não tem grupos.
- **Grupos de portas**: tipo, quantidade e capacidade de cada grupo (como no cadastro). Escolher um modelo do
  cadastro já preenche os grupos. No card, cada grupo começa numa linha própria, com o tipo à esquerda (**RJ45**,
  **SFP+**, **Canal DWDM**...) e as portas numeradas dentro do grupo. O rodapé do card mostra o total de portas e a
  capacidade somada (por exemplo *52 portas · 88G*). Nos cordões e na Manobra a porta aparece como
  *SFP+ 2 (10G)*.
- **Agregação de portas (LAG)**: clique em **+ Agregação**, dê um nome (LAG1, Po1, bond0...), escolha o modo
  **LACP (802.3ad)** ou **Estático** e clique nas portas que fazem parte dela (agrupadas por tipo). A janela mostra a
  capacidade agregada e avisa se as portas têm capacidades diferentes ou se alguma já está em outra agregação.
  No card, as portas de cada agregação ganham uma **barrinha colorida** embaixo (uma cor por LAG), e ao passar o
  mouse a porta mostra a agregação.
- **Gerência**: **IP / host** (IPv4, IPv4 com máscara, IPv6 ou nome), **Porta** e **Protocolo** (SSH, HTTPS, HTTP,
  Telnet, SNMP, Winbox ou API). Ao escolher o protocolo, a porta padrão dele é preenchida (SSH 22, HTTPS 443,
  Winbox 8291...). Informe também a **Porta física / interface** usada na gerência (uma porta, uma agregação ou
  **Porta MGMT dedicada (fora de banda)**) e a **VLAN** de gerência. O endereço aparece no rodapé do card, por
  exemplo *SSH 10.10.0.2:22*, e a porta de gerência ganha um **quadradinho azul** no canto. A janela avisa se a VLAN
  de gerência não passa pela interface escolhida. A **OLT** tem os mesmos campos.
- **VLANs**: digite as VLANs do equipamento (uma ou várias, como *10, 20, 100-110*) e clique em **+ VLAN**. Dê um
  nome a cada uma se quiser (GERENCIA, CLIENTES...). Depois, em **Portas e agregações**, escolha o **Modo** de cada
  interface:

  | Modo | Uso |
  |---|---|
  | **Access** | Uma VLAN, sem tag (porta de cliente, servidor, câmera). Escolha a VLAN. |
  | **Trunk** | Várias VLANs com tag (802.1Q), na coluna **Com tag** (ex.: *10, 20, 100-110*), e uma **nativa** opcional. Marque **todas** para liberar 1-4094. |
  | **Híbrida** | Uma VLAN sem tag (PVID) e outras com tag na mesma porta. |

  Uma porta que está numa agregação é configurada pela agregação. Para configurar várias portas de uma vez,
  marque as caixinhas da esquerda (ou a do cabeçalho, para todas), escolha modo e VLANs na faixa azul e clique em
  **Aplicar**. Cada VLAN mostra quantas interfaces a usam, e a janela avisa VLAN usada sem cadastro, porta access
  sem VLAN e VLAN repetida. No card, ao passar o mouse numa porta aparece a VLAN dela (*VLAN: trunk 10, 20 · nativa
  1*).

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

**Barra de ferramentas** (logo abaixo do título; passe o mouse sobre um ícone para ver o nome e o atalho)

| Ícone | Ferramenta | O que faz |
|---|---|---|
| ↶ ↷ | **Desfazer / Refazer** | Volta ou refaz a última alteração (**Ctrl+Z** / **Ctrl+Y**). |
| tubete | **Emenda** (F) | Ferramenta padrão: ligar duas portas cria uma **emenda por fusão** (perda de fusão). |
| conector | **Conector** (C) | Ligar duas portas cria uma **emenda por conector/acoplador** (soma a perda de conector). |
| ↔ | **Passagem** (P) | A fibra atravessa a caixa **sem emenda e sem perda** (sangria). Linha tracejada. |
| ◁ | **Splitter** (S) | Adiciona um splitter (veja abaixo). |
| pessoa | **Cliente** (K) | Adiciona um cliente (assinante) no diagrama, para ligar a uma saída de splitter (veja abaixo). |
| grupo | **Grupo** (G) | Com um **cabo** (ou a **emenda de uma fibra** dele) selecionado, junta tudo o que vem à frente dele num objeto **Grupo** recolhido (veja abaixo). Com um grupo selecionado, o botão vira **Expandir grupo / Recolher grupo**. |
| varinha | **Auto-fusão** | Funde as fibras em sequência entre dois cabos. |
| camadas | **Bandejas** (B) | Cria as bandejas de emenda da caixa e vincula os tubos loose dos cabos a cada uma (veja abaixo). |
| ↻ | **Girar** (R) | Splitter: gira **90°** a cada clique (entrada à esquerda, em cima, à direita, embaixo). Cabo: passa para o outro lado. Cliente: a porta troca de lado. |
| ⧉ | **Duplicar** (Ctrl+D) | Cria uma cópia do splitter selecionado. |
| lixeira | **Apagar** (Delete) | Apaga a emenda, o splitter ou as emendas do cabo selecionado. |
| borracha | **Limpar** | Apaga todas as emendas e passagens da caixa (pede confirmação; dá para desfazer). |
| grade | **Organizar** | Cabos de entrada à esquerda, de saída à direita (lado a lado) e splitters numa fileira acima. |
| curva | **Rotas** | Alterna as fibras entre **ângulo reto** (padrão) e **curvas**. A escolha fica salva no navegador. |
| pulso | **Potência** | Mostra ou esconde a potência (dBm) nas saídas dos splitters. |
| teclado | **Atalhos** (?) | Mostra a lista de atalhos do teclado. |
| PNG | **PNG** | Exporta o unifilar da caixa. |

**Como o diagrama é desenhado**

- Os cabos aparecem como cartões **CABO 12FO (A)**, **(B)**... com as fibras numeradas nas cores ABNT.
- As fibras andam em **ângulo reto (90°)**, cada uma na sua pista, sem se sobrepor.
- Cada **emenda por fusão** aparece como um **tubete cinza** sobre a fibra; a **emenda por conector** aparece
  como **dois conectores (azul e verde) num acoplador**. A **passagem** é a linha tracejada, sem ícone.
- As **saídas (derivações) dos splitters são numeradas** (1, 2, 3...). Splitters conectorizados (AC APC/UPC)
  mostram as saídas como **conectores verdes** em leque.

**Mexer no diagrama**

- **Arrastar** um bloco (cabo ou splitter) muda a posição dele. Arrastar o fundo move a tela.
- **Rolar o mouse** dá zoom. Os botões no canto fazem zoom +, zoom − e **ajustar à tela**.
- **Girar**: selecione o splitter e clique em **Girar** (ou tecla **R**) quantas vezes precisar.
- **Ajustar o traçado de uma fibra (90°)**: clique na fibra para selecioná-la. Aparece uma **alça amarela**
  (‹ ›) no trecho vertical: arraste para a esquerda ou para a direita. Duplo clique na alça (ou **Traçado
  automático** no quadro da emenda) volta ao traçado automático. **Organizar** também volta todos ao automático.

**Fundir duas fibras (ou fibra com splitter)**

1. Clique na **primeira porta**. Ela fica selecionada e um quadro no canto mostra a **potência que chega nela**,
   com o link **Ver orçamento**.
2. Clique na **segunda porta**. A linha da fusão é desenhada.
3. A emenda criada depende da ferramenta ativa na barra: **Emenda** (fusão), **Conector** ou **Passagem**.
4. Clique numa fibra ou numa porta já ligada para selecionar a emenda. Um quadro no canto mostra as duas pontas
   e permite **trocar o tipo** (Fusão / Conector / Passagem) ou **Apagar** (também pela tecla **Delete**).
   O quadro mostra também a **perda** usada no cálculo e o link **Tipo e perda…**.

O sistema não deixa ligar duas portas do mesmo elemento nem uma porta que já está ocupada.

**Tipo e perda de cada emenda** (duplo clique na emenda, ou **Tipo e perda…** no quadro)

Para o cálculo de potência ficar mais preciso, cada emenda pode ter o próprio tipo e a própria perda:

1. **Tipo de emenda**: **Fusão / emenda** ou **Conector / acoplador**.
2. **Conector / acoplador**: SC/APC, SC/UPC, LC/APC, LC/UPC, FC/APC, FC/UPC, ST/UPC, E2000/APC, MPO/MTP,
   conector de campo (fast connector) ou acoplador híbrido (ex.: SC ↔ LC). Cada um tem uma **perda típica**.
   Na fusão, o campo vira **Método**: fusão por alinhamento de núcleo (0,03 dB), por alinhamento de casca
   (0,08 dB) ou emenda mecânica (0,20 dB).
3. **Perda desta emenda (dB)**: digite o valor **medido** (máquina de fusão ou OTDR) quando tiver. Deixe vazio
   para usar a perda típica do tipo; sem tipo, vale a perda padrão do projeto ([seção 21](#21-configurações-do-projeto)).
4. O quadro **Perda usada no cálculo** mostra o valor e de onde ele vem (informada, típica do tipo ou padrão do
   projeto). Acima de 0,75 dB num conector ou 0,30 dB numa fusão aparece um aviso.

A potência nas portas, nos clientes, o orçamento óptico, a saúde do sinal e o OTDR virtual passam a usar essa
perda na hora. Passe o mouse sobre uma emenda para ver o tipo e a perda. Tudo pode ser desfeito com **Ctrl+Z**.

**Adicionar splitter**

1. Clique em **Splitter**.
2. Escolha **Balanceado** (1:2, 1:4, 1:8, 1:16, 1:32, 1:64, nas versões **RF**, **AC APC** e **AC UPC**) ou
   **Desbalanceado** (1/99, 2/98, 5/95 ... 50/50). A lista mostra a perda de cada saída.
3. O splitter aparece no diagrama. Ligue a **entrada (E)** a uma fibra do cabo que chega e as **saídas (1, 2, 3...)**
   às fibras que saem (drops ou outros cabos).
4. Splitters conectorizados (APC/UPC) somam também a perda de conector no orçamento.
5. Para **editar ou trocar o tipo** de um splitter já colocado, dê um **duplo clique** nele. Na janela
   **Editar splitter** dá para mudar o **nome** (ex.: SPL-01) e escolher outro modelo (balanceado ou
   desbalanceado, RF, AC APC ou AC UPC). As ligações continuam nas mesmas saídas. Se o novo modelo tiver
   **menos saídas**, a janela avisa quais ligações serão apagadas (dá para desfazer com **Ctrl+Z**). A potência
   e o orçamento são recalculados na hora.

Para remover um splitter, selecione o bloco e clique em **Apagar** (lixeira). Num bloco de cabo, **Apagar**
(ou **Delete**) pergunta o que apagar: **Só as emendas deste cabo nesta caixa** (o cabo continua no mapa) ou
**Excluir o cabo do projeto** (some do mapa e de todas as caixas; não dá para desfazer com Ctrl+Z). 

**Editar o cabo pelo diagrama**: **duplo clique** no cartão de um cabo, ou no **rótulo do drop** (a etiqueta
na linha até o cliente), abre **Editar cabo / Editar drop** com nome, tipo, status e **atenuação (dB/km)**. O
traçado, a cor e as reservas continuam no painel do cabo, no mapa.

**Cliente ligado por drop**: quando um cabo drop do mapa liga a caixa a um cliente, o diagrama não mostra o
cabo como cartão. Ele mostra o **próprio cliente do mapa** (cartão de cliente com ícone, sinal, ID e ONU), e o
drop é a **linha** que liga a saída do splitter (ou a fibra) até ele, com um rótulo com o nome e o comprimento
do drop. **Duplo clique** no cliente edita os dados dele (nome, tipo, ID, serial, sinal medido), que são salvos
direto no cliente do mapa. **Apagar** oferece tirar só a ligação nesta caixa ou excluir o drop do projeto (o
cliente continua no mapa). Um cliente que já tem drop não pode ser vinculado de novo a um objeto Cliente.

**Cliente no diagrama**

1. Clique em **Cliente** (ou tecla **K**).
2. Se o cliente já existe no mapa, escolha-o em **Cliente do mapa** (a lista mostra os mais próximos da caixa
   primeiro; os que já estão ligados em outro diagrama aparecem desabilitados). O nome é preenchido sozinho.
   Também dá para criar um cliente só no diagrama, sem vínculo.
3. O cartão do cliente (com o ícone da casa) aparece no diagrama. Ligue uma **saída do splitter** (ou uma fibra)
   à porta do cliente com **Emenda** ou **Conector**.
4. O cartão mostra a **potência que chega no cliente** (dBm, na cor do nível: OK, atenção, crítico ou sinal alto).
   Clique no cliente para ver a perda total e a porta PON de origem. Use **Editar** (ou duplo clique) para
   trocar o nome ou o vínculo, e **Trocar lado da porta** (tecla **R**) para virar a porta para o outro lado.
5. **Dados para integração:** na mesma janela informe o **tipo de cliente** (**Residencial** = casa,
   **Empresarial** = loja, **Corporativo** = prédio), o **ID do cliente** (código no sistema de gestão) e o
   **serial da ONU/ONT** (ex.: *HWTC1A2B3C4D*; o sistema tira espaços, põe em maiúsculas, avisa se o formato não
   for o usual e se o serial já estiver em outro cliente). O ícone do cartão muda conforme o tipo.
   Com o cliente vinculado ao mapa, esses dados são gravados também no cliente do mapa ao salvar o diagrama
   (o ícone dele no mapa também muda: casa, loja ou prédio). No mapa, os mesmos campos ficam no painel do cliente.
6. **Sinal medido e saúde do cliente:** em **Sinal medido na ONU/ONT (dBm)** (no painel do mapa: **Sinal medido (dBm)**) informe o valor lido na ONU/ONT
   (no futuro ele virá do FiberControl pelo serial). O sistema compara com o sinal **estimado** pelo orçamento
   óptico e mostra a **saúde** no cartão e ao clicar no cliente:
   - **Saudável**: dentro do estimado (até 2 dB abaixo) e dentro dos limites da ONU;
   - **Atenção**: de 2 a 4 dB abaixo do estimado, sinal no limite de atenção, sinal alto demais para a ONU
     ou mais de 3 dB **acima** do estimado (sinal de que o projeto não bate com o campo);
   - **Problema**: mais de 4 dB abaixo do estimado ou abaixo da sensibilidade da ONU.

   Quando o sinal está abaixo do esperado, o sistema indica o **trecho provável do problema**: ele compara com
   os outros clientes que têm sinal medido. Os pontos por onde passam clientes com sinal bom estão funcionando,
   então o problema fica **depois do último ponto em comum** com eles. A lista **Pontos a verificar** mostra, da
   OLT para o cliente, as emendas, conectores, saídas de splitter e cabos desse trecho. Se outros clientes depois
   desse ponto também estiverem abaixo, o aviso diz isso (sinal de um ponto comum, como uma emenda da CTO).
   Quanto mais clientes com sinal medido, mais preciso fica o trecho. A data da medição aparece junto.
7. Quando o cliente do mapa **não tem cabo drop**, a potência dele no mapa (painel do cliente, análise de rede)
   passa a ser calculada por este caminho do diagrama.

**Bandejas de emenda e tubos loose**

Nos cabos com vários tubos (24, 36, 48 FO...; 12 fibras por tubo, conforme o modelo do cabo) você organiza
cada tubo na sua bandeja, como na caixa real.

1. Clique em **Bandejas** (ou tecla **B**).
2. Escolha a capacidade (12, 16, 24, 36, 48 ou 72 fusões) e clique em **+ Bandeja**. Crie quantas precisar.
3. Com a bandeja selecionada à esquerda, clique nos **tubos** dos cabos (ex.: *Tubo 2 Amarelo · FO 13–24*) para
   vinculá-los. Clicar de novo desvincula. Cada tubo fica em **uma bandeja só**: clicar num tubo que está em
   outra bandeja muda ele de bandeja.
4. Ali também dá para **renomear**, mudar a **capacidade** ou **apagar** a bandeja (as emendas continuam).

No diagrama (**bandeja aberta**):

- Quando um tubo é vinculado, o **cabo deixa de mostrar as 12 FO desse tubo** e fica só com a **derivação do tubo
  loose**: uma linha *Tubo 1 Verde · FO 1–12 → Bandeja 1* e uma linha grossa na cor do tubo até a bandeja.
- As FO do tubo viram **portas da bandeja**: as dos cabos desenhados à esquerda da bandeja ficam no lado esquerdo,
  as dos cabos à direita no lado direito (ex.: 12 conexões de cada lado). Arrastar um cabo para o outro lado da
  bandeja muda o lado das FO dele. Se todos os cabos estiverem do mesmo lado, o mais à esquerda vai para a esquerda.
- As **emendas dentro da bandeja aparecem no próprio cartão**, com o tubete de fusão (ou o conector). **FO
  cruzadas** (ex.: 3 → 5) aparecem com o traço desviando e a emenda em **amarelo**.
- O cabeçalho mostra a **ocupação** (*11/12 fusões*: verde, amarela perto de lotar, **vermelha acima da
  capacidade**) e o rodapé mostra o resumo: *fusões · cruzadas · FO livres*.
- Uma porta da bandeja também pode ser ligada a algo fora dela (ex.: entrada do splitter): clique na porta e
  depois no destino, como em qualquer outra porta.

**Editar as fusões da bandeja** (duplo clique no cartão):

1. Escolha **Emenda (fusão)** ou **Conector**.
2. Clique numa FO de um lado e depois na FO do outro lado. Para **cruzar**, é só ligar números diferentes.
3. Clique numa emenda para selecioná-la: **Trocar fusão/conector**, **Apagar emenda**, e embaixo escolha o
   **tipo de conector ou método da fusão** e a **perda** dessa emenda (como na janela **Tipo e perda**).
4. **1↔1 automático** funde 1 com 1, 2 com 2... nas FO livres. **Limpar bandeja** apaga as emendas internas.
   **Tubos da bandeja…** abre a janela de vínculo dos tubos. Tudo pode ser desfeito com **Ctrl+Z**.

Para mover a bandeja, arraste o cartão. Para apagar, selecione e use **Apagar** (Delete): o tubo volta a mostrar
as FO no cartão do cabo e as emendas continuam. **Organizar** empilha as bandejas entre os cabos.

<a id="grupo"></a>
**Grupo: recolher tudo o que vem à frente de um cabo**

Numa caixa com muitos splitters e clientes, o **Grupo** junta num cartão só tudo o que deriva de um cabo, como os
equipamentos recolhidos num rack do POP.

1. Selecione o **cabo** (clique no cartão do cabo) para pegar tudo o que sai de **todas as fibras** dele, ou
   selecione a **emenda de uma fibra** (ex.: *Cabo A · FO 1 Verde → 1:8 RF*) para pegar só o que vem daquela fibra.
2. Clique em **Grupo** na barra (ou tecla **G**). O sistema segue a luz a partir do cabo: entra nos splitters pela
   entrada, segue pelas saídas (splitters em cascata também) e chega nos **clientes** e **drops**. Cabos que saem
   da caixa (para outra CTO) são o limite do grupo e continuam fora dele.
3. Esses objetos viram um cartão **Grupo** recolhido (nome, de onde parte, quantos splitters e clientes, o **pior
   sinal** entre os clientes e a lista dos objetos). As fibras que entram e saem do grupo chegam nas laterais do
   cartão, com as emendas no lugar.

- **Expandir**: clique na setinha do cartão, dê **duplo clique** nele ou use **Expandir grupo** na barra. Os objetos
  voltam para o diagrama dentro de uma **moldura tracejada** com o nome do grupo. **Arrastar a aba** da moldura
  move o grupo todo. A setinha da aba (ou duplo clique nela) **recolhe** de novo, e o cartão fica onde o grupo estava.
- O grupo não guarda uma lista fixa: o que for **ligado depois** à frente do cabo entra nele sozinho, e o que for
  desligado sai.
- Selecionado, o grupo mostra um painel onde dá para **renomear** (ex.: *Grupo Rua das Flores*), expandir/recolher
  e **Desfazer grupo** (Delete): só o grupo some, os splitters, clientes e emendas continuam no diagrama.
- Selecionar o mesmo cabo (ou a mesma fibra) e clicar em **Grupo** de novo abre ou recolhe o grupo que já existe.

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

O quadro **Potência na ONU** junta, num cartão só, a potência **Estimada** (orçamento óptico) e a **Medida** na
ONU/ONT, com a saúde do sinal (**Saudável**, **Atenção**, **Problema**) no canto. Se não houver estimativa, o motivo
aparece uma vez só, logo abaixo dos valores. No painel do cliente, o campo **Sinal medido (dBm)** fica ao lado do
**ID do cliente**, e o **Serial ONU/ONT** ocupa a linha inteira.

**Painel de propriedades compacto:** o painel do objeto mostra **Nome** e **Status** lado a lado e os campos mais
baixos, para caber quase tudo sem rolar. Quando ainda precisa rolar (tela baixa ou objeto com muitos campos),
o título do objeto fica fixo no topo e os botões **Excluir / Histórico / Salvar alterações** ficam fixos embaixo,
e só o meio rola, com uma barra fina e discreta nas cores do painel (vale também para as janelas e listas do app).

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
- Em **CTO/CEO com fixação pendente** aparecem as que ainda não dizem se estão no poste, na parede ou numa caixa
  (ou estão sem o endereço do imóvel). Clique para ir até ela e completar.
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
2. Os pontos viram caixas conforme o **nome da pasta** (e, se a pasta não disser, o **nome do ponto**): *CTO*,
   *caixa de atendimento* ou *terminais de atendimento* → CTO; *CEO*, *emenda* ou *caixas de emenda* → CEO; *POP*,
   *OLT*, *estações* ou *racks* → POP; *datacenter* → Datacenter; *torre*, *tower*, *ERB* ou *RBS* → Torre; *caixa de
   passagem*, *caixa subterrânea*, *caixa de parede* ou *CX* → Caixa; *condomínio*, *edifício* ou *residencial* →
   Condomínio; *poste* → Poste; *cliente*, *ONU* ou *assinante* → Cliente. Assim um poste chamado "COSERN POP N44095"
   dentro da pasta *Postes* continua sendo poste.
3. As linhas viram cabos. Se o nome tiver a quantidade de fibras (ex.: *12FO*, *24 fibras*) ela é usada; *backbone*,
   *tronco* ou *BCK* define o tipo. A **cor e a espessura** da linha no arquivo são mantidas. As pontas dos cabos se
   ligam às caixas que estiverem a até **15 m**.
4. Os **polígonos** viram **áreas** (com nome e cor).
5. A **descrição** do ponto ou da linha vai para **Observações** (ex.: "SINAL -18.45" anotado na CTO).
6. Se o nome do arquivo disser de quem são os postes (ex.: *POSTES COSERN*, *POSTES INTELNET*), esse nome é gravado
   como **proprietário** dos postes (veja na Tabela de postes).
7. Pontos repetidos (mesmo tipo e nome a menos de 2 m) são ignorados. Assim dá para importar vários arquivos no mesmo
   projeto (por exemplo, postes COSERN e postes próprios) sem duplicar nada.
8. Ao final aparece quantos pontos, cabos e áreas foram importados.

Dica: no Google Earth, organize as pastas com nomes como *CTOs*, *CEOs*, *Postes*, *Clientes* antes de exportar.

**Importar vários projetos de uma vez** (tela **Meus projetos** → **Importar projetos**)

1. Escolha um arquivo `.zip` com vários `.kmz`/`.kml` dentro (por exemplo, a **exportação do ISM**) ou selecione
   vários `.kmz`/`.kml` de uma vez.
2. **Cada arquivo vira um projeto separado**, com o nome do arquivo. Um nome como *Brejinho - RN* também preenche a
   cidade. O mapa do projeto já abre centralizado na rede importada.
3. A exportação do ISM é reconhecida: *Terminais de atendimento* → CTO, *Caixas de emenda* → CEO, *Estações* → POP
   (com ícone de antena → Torre), *Racks* → POP, *Postes* (inclusive as subpastas "De 0 até 500"), *Cabos* e
   *Áreas personalizadas* → áreas. O número que o ISM coloca no fim do nome do cabo, como "(201)", sai do nome e fica
   em Observações como *Código de origem*.
4. No fim aparece uma tabela com o que entrou em cada projeto e um botão **Abrir**. Se um arquivo falhar, os outros
   continuam sendo importados e o erro aparece na linha dele.
5. Depois de importar, use a ferramenta [Fixar em massa](#fixar-em-massa) para prender de uma vez as CTOs, CEOs e
   reservas nos postes mais perto (as que vêm do ISM chegam sem fixação, com o ponto âmbar).

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

**Motor de mapas** (todos os usuários): escolha **OpenStreetMap** (padrão), **Esri (ArcGIS)** ou **Google Maps**.
O Google aparece sempre na lista, mas fica apagado com "(precisa de chave)" enquanto o projeto não tem chave. A troca
vale na hora e fica salva neste navegador. Embaixo da lista aparece de onde vem cada estilo (Satélite, Ruas, Relevo)
no motor escolhido.

**Chave do Google** (logo abaixo): mostra se há chave (os 4 primeiros e 4 últimos caracteres, ex.: `AIza…x9Q2`) e de
onde ela vem (sua conta, o dono do projeto ou o `.env` do servidor). Só o **dono do projeto** vê **Cadastrar chave do
Google**, **Trocar chave** e **Remover**; os outros membros veem só a situação. Passo a passo na [seção 4](#4-a-tela-do-mapa).

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

As perdas de fusão e de conector daqui valem para as emendas que não têm tipo nem perda própria no diagrama
(veja **Tipo e perda de cada emenda** na [seção 8](#8-diagrama-de-fusão-da-ceo-e-da-cto)).

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
| **G** | Diagrama | Cria o grupo do cabo (ou da fibra) selecionado; com um grupo selecionado, expande ou recolhe. |
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
