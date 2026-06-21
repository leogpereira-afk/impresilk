/* pops.js — Biblioteca de Procedimentos Operacionais Padrão (POPs)
   Manual Impresilk v1.0 — 33 procedimentos em 8 categorias.
   Dados estáticos + renderização da aba "POPs" (item 23/24/25 da spec).
   Itens [IA] (26 busca por linguagem natural, 27 sugestão automática) ficam
   para a fase de IA. Aqui há busca textual simples e envio via WhatsApp Web. */

const POP_CATS = [
  { id: 'adesivos',     label: 'Adesivos',                ico: '🎯' },
  { id: 'envelopamento',label: 'Envelopamento',           ico: '🚗' },
  { id: 'acm',          label: 'ACM e Fachadas',          ico: '🏢' },
  { id: 'letras',       label: 'Letras e Luminosos',      ico: '💡' },
  { id: 'banners',      label: 'Banners e Tensionados',   ico: '🚩' },
  { id: 'sinalizacao',  label: 'Sinalização',             ico: '🛑' },
  { id: 'altura',       label: 'Instalação em Altura',    ico: '🪜' },
  { id: 'acabamento',   label: 'Acabamento e Plotagem',   ico: '✂️' },
];

const POPS = [
  // ── ADESIVOS ──────────────────────────────────────────────────────────────
  {
    id: 1, cat: 'adesivos', titulo: 'Aplicação de adesivo em parede lisa',
    nivel: 'Básico', tempo: '30 a 60 minutos',
    materiais: ['Adesivo vinílico cortado e pronto para aplicação', 'Álcool isopropílico 70%', 'Pano de microfibra limpo', 'Fita crepe'],
    ferramentas: ['Rodo de silicone ou feltro', 'Estilete com lâmina nova', 'Nível de bolha ou laser', 'Fita métrica', 'Régua metálica'],
    passos: [
      'Limpe a superfície com álcool isopropílico e pano de microfibra. Aguarde secar completamente (mínimo 5 minutos).',
      'Meça e marque com lápis os pontos de referência para o posicionamento correto do adesivo.',
      'Utilize o nível para garantir que a marcação está alinhada horizontal ou verticalmente conforme o projeto.',
      'Posicione o adesivo sobre a superfície ainda com a proteção traseira. Fixe a borda superior com fita crepe como dobradiça.',
      'Vire o adesivo para cima mantendo a dobradiça e remova metade da proteção traseira (liner).',
      'Abaixe o adesivo com cuidado e pressione do centro para as bordas com o rodo, expulsando o ar.',
      'Remova a outra metade da proteção e repita o processo.',
      'Finalize passando o rodo por toda a superfície com pressão firme, sempre do centro para as extremidades.',
      'Remova a película superior (transfer) com movimento suave em ângulo de 45° se aplicável.',
      'Verifique se há bolhas ou bordas levantadas e corrija imediatamente.',
    ],
    atencao: [
      'Nunca aplique em superfícies com tinta fresca — aguardar mínimo 30 dias após pintura.',
      'Temperatura ideal de aplicação: entre 15 °C e 35 °C. Evitar dias frios ou úmidos.',
      'Não puxe o rodo de volta sobre área já aplicada — sempre do centro para fora.',
      'Paredes com textura grossa ou irregularidades requerem o POP de parede texturizada.',
    ],
    dicas: [
      'Nível laser agiliza o posicionamento em peças grandes.',
      'Em peças muito longas, dois instaladores trabalham melhor: um segura, o outro passa o rodo.',
      'Sempre testar aderência em pequena área antes de aplicar, especialmente em pinturas antigas.',
    ],
  },
  {
    id: 2, cat: 'adesivos', titulo: 'Aplicação de adesivo em parede texturizada',
    nivel: 'Médio', tempo: '1 a 2 horas',
    materiais: ['Adesivo vinílico de alta performance ou monomérico especial para superfícies irregulares', 'Primer de aderência específico para vinil', 'Álcool isopropílico 70%', 'Pano de microfibra', 'Secador de ar quente / heat gun'],
    ferramentas: ['Rodo de feltro (mais macio que o de borracha)', 'Estilete com lâmina nova', 'Nível de bolha', 'Fita métrica'],
    passos: [
      'Limpe bem a superfície com álcool isopropílico — remova poeira, gordura e resíduos. Aguarde 10 minutos.',
      'Aplique o primer de aderência com pano limpo em toda a área. Aguarde o tempo indicado pelo fabricante (geralmente 5 a 15 minutos).',
      'Posicione o adesivo com a técnica da dobradiça de fita crepe, igual ao POP de parede lisa.',
      'Inicie a aplicação do centro para as bordas com rodo de feltro usando pressão moderada.',
      'Use o heat gun para amolecer o adesivo e conformá-lo às irregularidades da textura. Mantenha distância de 10 a 15 cm e movimentos constantes.',
      'Enquanto o adesivo ainda está quente, pressione com rodo de feltro sobre toda a área aquecida.',
      'Repita o processo de calor + rodo por todas as seções do adesivo.',
      'Finalize verificando todas as bordas e aplicando heat gun com pressão extra nos pontos de maior textura.',
      'Aguarde esfriar antes de remover o transfer.',
    ],
    atencao: [
      'Nunca superaqueça o adesivo — o vinil pode deformar ou perder adesividade.',
      'Superfícies com textura muito grossa (goticola, cimento queimado irregular) podem exigir massa corrida antes.',
      'O primer modifica a superfície: testar em área oculta antes de aplicar em toda a parede.',
      'Bordas são os pontos críticos — dar atenção redobrada com rodo e heat gun nas extremidades.',
    ],
    dicas: [
      'Prefira adesivos de alta performance (ex.: 3M IJ180, Avery MPI1105) para texturas.',
      'Em texturas muito agressivas, trabalhar em seções menores de 30 a 40 cm por vez.',
      'Verificar aderência 24 horas depois e reforçar bordas com cola de contato se necessário.',
    ],
  },
  {
    id: 3, cat: 'adesivos', titulo: 'Adesivo em vidro (jateado / espelhado)',
    nivel: 'Básico', tempo: '30 a 45 minutos',
    materiais: ['Adesivo específico para vidro (jateado, espelhado ou transparente conforme projeto)', 'Água com detergente neutro (solução de aplicação)', 'Álcool isopropílico 70%', 'Pano de microfibra'],
    ferramentas: ['Rodo de borracha macio', 'Estilete', 'Borrifador com solução água + detergente', 'Nível de bolha', 'Fita métrica'],
    passos: [
      'Limpe o vidro com álcool isopropílico e pano de microfibra — nenhum resíduo, gordura ou marca de dedo.',
      'Meça e marque com caneta removível os pontos de posicionamento.',
      'Prepare a solução de aplicação: água com 2 gotas de detergente neutro em borrifador.',
      'Borrife a solução generosamente no vidro (o método úmido facilita o posicionamento e elimina bolhas).',
      'Remova o liner do adesivo e borrife também na face adesiva.',
      'Posicione o adesivo sobre o vidro molhado — ele desliza para ajuste fino de posição.',
      'Quando alinhado corretamente, passe o rodo do centro para as bordas, expulsando a água.',
      'Use o rodo com pressão firme em movimentos sobrepostos até remover toda a água.',
      'Seque as bordas com pano de microfibra.',
      'Aguarde 24 horas para aderência completa antes de qualquer limpeza.',
    ],
    atencao: [
      'Vidros temperados ou com película existente requerem adesivos específicos — confirmar antes de executar.',
      'Não usar adesivo convencional em vidros expostos a sol direto intenso sem indicação UV do fabricante.',
      'A solução de aplicação deve ter pouco detergente — excesso deixa resíduo que impede aderência.',
      'Em vidros de portas, verificar se o adesivo não interfere com a dobragem do vidro ao abrir.',
    ],
    dicas: [
      'O método úmido é essencial para vidros — nunca aplicar a seco.',
      'Rodo de borracha macio evita riscar ou marcar o vidro.',
      'Para adesivos maiores, dois instaladores garantem posicionamento sem vincos.',
    ],
  },
  {
    id: 4, cat: 'adesivos', titulo: 'Adesivo de piso antiderrapante',
    nivel: 'Médio', tempo: '1 a 3 horas',
    materiais: ['Adesivo de piso antiderrapante (vinil com textura ou laminação especial)', 'Primer de aderência para piso', 'Álcool isopropílico', 'Pano de microfibra', 'Selante de borda transparente'],
    ferramentas: ['Rodo rígido ou rolete de pressão', 'Estilete e régua metálica', 'Nível laser (para alinhamento de setas ou faixas)', 'Fita crepe', 'Soprador ou heat gun'],
    passos: [
      'Verifique o estado do piso: deve estar seco, livre de poeira, óleo, cera ou tinta solta. Lixe levemente se necessário.',
      'Limpe com álcool isopropílico e aguarde secar completamente — mínimo 15 minutos.',
      'Aplique primer de aderência para piso conforme instrução do fabricante. Aguarde cura.',
      'Marque o layout no piso com fita crepe seguindo o projeto aprovado.',
      'Corte os adesivos no tamanho exato com estilete e régua metálica. Bordas mal cortadas levantam com mais facilidade.',
      'Aplique do centro para as extremidades com rolete de pressão, exercendo força constante.',
      'Passe o rolete por toda a área múltiplas vezes em direções diferentes para garantir aderência total.',
      'Aplique heat gun nas bordas e pressione com rodo para garantir que não levantem.',
      'Sele todas as bordas com selante transparente para evitar infiltração de água e sujeira.',
      'Sinalize a área e impeça trânsito por no mínimo 2 horas.',
    ],
    atencao: [
      'Pisos de madeira, vinílico ou borracha exigem primers específicos — produto errado compromete a aderência.',
      'Não instalar em pisos com umidade ascendente — o adesivo desgruda em dias.',
      'Cantos e juntas são pontos críticos — reforçar com selante extra.',
      'Verificar com o cliente se o adesivo é compatível com o produto de limpeza usado no local.',
    ],
    dicas: [
      'Rolete de pressão é muito mais eficaz que rodo para pisos — sempre preferir.',
      'Testar um pedaço de 30 × 30 cm 24 horas antes da aplicação completa.',
      'Em áreas com muito tráfego, aplicar laminação extra de proteção sobre o adesivo.',
    ],
  },
  {
    id: 5, cat: 'adesivos', titulo: 'Adesivo perfurado (visão traseira)',
    nivel: 'Médio', tempo: '1 a 2 horas',
    materiais: ['Adesivo microperfurado (one-way vision) impresso e laminado', 'Álcool isopropílico', 'Pano de microfibra'],
    ferramentas: ['Rodo de borracha macio', 'Estilete com lâmina nova', 'Fita métrica', 'Nível de bolha', 'Régua metálica'],
    passos: [
      'Limpe o vidro com álcool isopropílico — sem nenhum resíduo.',
      'Meça e marque o posicionamento considerando as margens do caixilho.',
      'Remova o liner e posicione o adesivo a seco — o perfurado não é compatível com o método úmido.',
      'Com auxílio de um colaborador, alinhe a peça cuidadosamente antes de pressionar.',
      'Fixe a borda superior com fita crepe como dobradiça.',
      'Aplique do centro para as bordas com rodo macio e pressão moderada.',
      'Nas bordas, use o estilete para cortar o excesso rente ao caixilho ou moldura.',
      'Passe o rodo por toda a peça com pressão firme em movimentos sobrepostos.',
      'Verifique a visão traseira de dentro do ambiente para confirmar transparência adequada (mínimo 30% de visão).',
    ],
    atencao: [
      'Nunca usar método úmido — a água entra pelos furos e compromete a aderência.',
      'Confirmar orientação da impressão: o lado correto da imagem fica para fora, o branco/liner para o vidro.',
      'Estilete mal afiado rasga o material — sempre lâmina nova.',
      'Em vidros com película refletiva existente, verificar compatibilidade antes de aplicar.',
    ],
    dicas: [
      'Perfurado 50/50 oferece melhor visão interna que 60/40 — confirmar porcentagem com o cliente.',
      'Usar régua metálica para cortes retos nas bordas — nunca cortar no olho.',
      'Pressão excessiva com o rodo pode amassar o material — pressão moderada e constante é suficiente.',
    ],
  },
  {
    id: 6, cat: 'adesivos', titulo: 'Remoção de adesivo sem dano à superfície',
    nivel: 'Avançado', tempo: '1 a 4 horas',
    materiais: ['Removedor de adesivo (Solvente 2000, álcool isopropílico ou WD-40)', 'Pano de microfibra', 'Luva de proteção', 'Máscara (para ambientes fechados)'],
    ferramentas: ['Heat gun ou secador industrial', 'Estilete ou espátula plástica (nunca metálica em superfícies pintadas)', 'Rodo de borracha', 'Escada se necessário'],
    passos: [
      'Avalie o tipo de superfície e o estado do adesivo. Adesivos antigos exigem mais cuidado.',
      'Aqueça uma ponta do adesivo com heat gun (temperatura média, cerca de 60 °C) por 15 a 20 segundos.',
      'Puxe o adesivo aquecido lentamente em ângulo de 45° — nunca puxar verticalmente.',
      'Continue aquecendo sempre 5 a 10 cm à frente do ponto de puxada para facilitar a remoção.',
      'Se o adesivo rasgar, reaqueça e continue — nunca force sem calor.',
      'Com o adesivo removido, aplique removedor sobre o resíduo de cola com pano de microfibra.',
      'Aguarde o removedor agir (2 a 5 minutos) e esfregue suavemente com movimentos circulares.',
      'Limpe o removedor com pano úmido e álcool isopropílico.',
      'Inspecione a superfície contra a luz para garantir ausência de resíduos.',
      'Repita o processo de removedor se necessário até a superfície ficar completamente limpa.',
    ],
    atencao: [
      'Heat gun muito próximo ou quente demais pode danificar tinta, plástico e vidro — SEMPRE testar antes.',
      'Nunca usar estilete metálico em superfícies pintadas, lacadas ou acrílico.',
      'Solventes agressivos (thinner, acetona) podem remover a tinta — usar apenas removedor específico para vinil.',
      'Em superfícies de MDF ou madeira crua, a umidade do removedor pode manchar.',
    ],
    dicas: [
      'Adesivos novos (menos de 1 ano) saem com muito mais facilidade.',
      'Fotografar a superfície antes da remoção para registrar o estado original.',
      'Testar o removedor em área oculta antes de aplicar na área visível.',
    ],
  },

  // ── ENVELOPAMENTO ─────────────────────────────────────────────────────────
  {
    id: 7, cat: 'envelopamento', titulo: 'Envelopamento total de veículo',
    nivel: 'Avançado', tempo: '1 a 2 dias',
    materiais: ['Filme de envelopamento cast (ex.: 3M 1080, Avery Supreme, Oracal 970)', 'Álcool isopropílico 70%', 'Solução de aplicação (água + IPA 5%)', 'Luvas de algodão', 'Primer de aderência para bordas e recortes'],
    ferramentas: ['Rodo de feltro e rodo de borracha', 'Heat gun', 'Estilete com lâminas novas', 'Magnetos de posicionamento', 'Régua metálica e fita métrica', 'Fita crepe'],
    passos: [
      'Lavar e desengordurar completamente o veículo. Usar IPA em toda a lataria.',
      'Remover maçanetas, emblemas e frisos que possam ser retirados sem ferramentas especializadas.',
      'Começar pelo capô: cortar o filme com sobra de 5 cm em cada lado.',
      'Posicionar o filme sobre o capô ainda com liner usando magnetos para manter no lugar.',
      'Remover o liner e borrifar solução IPA + água na face adesiva e na lataria.',
      'Posicionar o filme molhado e ajustar antes que seque.',
      'Fixar o centro e passar o rodo de feltro do centro para as bordas em movimentos sobrepostos.',
      'Dobrar as bordas para baixo do painel aquecendo com heat gun para conformar as curvas.',
      'Usar técnica de dedo (finger pull) nas curvas complexas: pequenos cortes para aliviar tensão.',
      'Trabalhar cada painel individualmente (portas dianteira e traseira, paralamas, coluna).',
      'Nas colunas e bordas, aplicar primer antes de dobrar o filme.',
      'Finalizar com heat gun em todos os bordos dobrados para ativação do adesivo.',
      'Inspecionar todo o veículo após 24 horas e reforçar pontos críticos se necessário.',
    ],
    atencao: [
      'Filme cast é essencial para envelopamento total — filme monomérico não funciona em curvas.',
      'Temperatura ideal: entre 18 °C e 25 °C. Frio deixa o filme rígido; calor ativa o adesivo prematuramente.',
      'Nunca esticar o filme em excesso — memória elástica faz ele encolher com o calor do sol.',
      'Borda do capô (frente do veículo) exige primer para aguentar o escoamento de vento em alta velocidade.',
    ],
    dicas: [
      'Reservar 30 a 40% a mais de filme do que a metragem calculada — reposicionamentos consomem material.',
      'Trabalhar em garagem fechada, sem vento e com boa iluminação.',
      'Usar luvas de algodão para não marcar o filme com impressões digitais.',
      'Deixar o veículo em local fechado por 48 horas após a aplicação antes de lavar.',
    ],
  },
  {
    id: 8, cat: 'envelopamento', titulo: 'Envelopamento parcial (capô, teto, portas)',
    nivel: 'Médio', tempo: '3 a 6 horas',
    materiais: ['Filme cast na metragem proporcional ao painel', 'Álcool isopropílico 70%', 'Solução de aplicação (água + IPA 5%)', 'Primer de aderência para bordas'],
    ferramentas: ['Rodo de feltro e rodo de borracha', 'Heat gun', 'Estilete com lâminas novas', 'Fita pinstripe (para marcação da linha de corte)', 'Nível de bolha'],
    passos: [
      'Limpar e desengordurar apenas o painel a ser envelopado com IPA.',
      'Definir os limites exatos do envelopamento com fita pinstripe como guia visual.',
      'Cortar o filme com sobra de 5 cm em todos os lados.',
      'Aplicar com método úmido (solução IPA + água) para ajuste de posição.',
      'Passar rodo do centro para as bordas eliminando bolhas de ar e água.',
      'Nas bordas visíveis (que não dobram), fazer acabamento com corte preciso rente à linha definida.',
      'Nas bordas que dobram, aquecer e dobrar o filme para baixo.',
      'Aplicar primer nas bordas dobradas antes de finalizar.',
      'Inspecionar após 24 horas.',
    ],
    atencao: [
      'A linha de corte em envelopamento parcial é a parte mais visível do serviço — deve ser impecável.',
      'Evitar cortar sobre a lataria com estilete — usar régua e distância da superfície.',
      'Diferentes painéis do mesmo veículo podem ter leves variações de cor — garantir que o material é do mesmo lote.',
    ],
    dicas: [
      'Alinhar a linha de corte com o friso de centro em capôs parciais para resultado mais limpo.',
      'Fotografar a linha de limite antes de iniciar para referência durante a execução.',
    ],
  },
  {
    id: 9, cat: 'envelopamento', titulo: 'Envelopamento de frota com padronização',
    nivel: 'Avançado', tempo: '1 a 2 dias por veículo',
    materiais: ['Filme cast em quantidade proporcional à frota (mesmo lote)', 'Álcool isopropílico', 'Primer de aderência', 'Gabarito físico do primeiro veículo'],
    ferramentas: ['Rodo de feltro e rodo de borracha', 'Heat gun', 'Estilete com lâminas novas', 'Câmera fotográfica para documentação'],
    passos: [
      'Criar gabarito físico do primeiro veículo marcando posições de todos os elementos.',
      'Documentar os parâmetros de cada painel (distância da maçaneta, altura do friso etc.).',
      'Aplicar o primeiro veículo e fotografar todos os pontos de referência.',
      'Usar o gabarito para garantir que todos os demais veículos fiquem idênticos.',
      'Verificar ao final de cada veículo comparando com a foto de referência do veículo padrão.',
      'Registrar o número de lote do filme para futuras manutenções ou reparos.',
    ],
    atencao: [
      'Mesmo modelo de veículo pode ter pequenas variações de safra e ano — verificar antes de cortar todos os painéis de uma vez.',
      'Garantir que todo o filme é do mesmo lote — cores podem variar entre lotes.',
      'Documentar o número do lote para reposição futura em casos de dano pontual.',
    ],
    dicas: [
      'O gabarito do primeiro veículo economiza horas nos demais.',
      'Fotografar frente, lateral e traseira de cada veículo finalizado para arquivo de conformidade.',
    ],
  },
  {
    id: 10, cat: 'envelopamento', titulo: 'Wrap de para-choque e painel frontal',
    nivel: 'Médio', tempo: '2 a 4 horas',
    materiais: ['Filme cast (adequado para plástico)', 'Primer especial para plástico', 'Álcool isopropílico'],
    ferramentas: ['Rodo de feltro', 'Heat gun', 'Estilete com lâminas novas', 'Espátula plástica'],
    passos: [
      'Limpar e desengordurar o para-choque com IPA — plásticos acumulam mais gordura que lataria.',
      'Aplicar primer para plástico e aguardar cura conforme instrução do fabricante.',
      'Aquecer levemente o para-choque antes de iniciar — plástico frio dificulta a aplicação.',
      'Aplicar do centro para as bordas com técnica de dedo (finger pull) nos relevos.',
      'Usar heat gun constantemente para conformar o filme nos contornos do para-choque.',
      'Nas ventosas e entradas de ar, fazer corte interno e dobrar para dentro.',
      'Verificar toda a superfície após 1 hora e reforçar bordas se necessário.',
    ],
    atencao: [
      'Plástico sem primer: o filme desgruda em dias.',
      'Para-choques pintados diferem de para-choques plástico bruto — verificar o acabamento antes.',
      'Plástico retém calor — evitar superaquecimento que pode deformar o para-choque.',
    ],
    dicas: [
      'Trabalhar em seções pequenas nos para-choques — o material tem muitas curvas compostas.',
      'Finger pull (pequenos cortes radiais) é a técnica mais eficaz para alívio de tensão em relevos.',
    ],
  },

  // ── ACM E FACHADAS ────────────────────────────────────────────────────────
  {
    id: 11, cat: 'acm', titulo: 'Corte e dobra de chapa ACM',
    nivel: 'Avançado', tempo: 'Variável conforme metragem',
    materiais: ['Chapas de ACM (alumínio composto)', 'Silicone neutro para vedação', 'Parafusos auto-atarrachantes inox'],
    ferramentas: ['Serra circular com lâmina específica para alumínio', 'Dobradeira manual ou hidráulica', 'Furadeira com broca para metal', 'Estilete para chanfrar o miolo antes de dobrar', 'Nível, prumo e esquadro', 'Fita métrica'],
    passos: [
      'Conferir as dimensões do projeto antes de qualquer corte — medir duas vezes, cortar uma.',
      'Marcar o traçado do corte com caneta permanente ou giz.',
      'Cortar a chapa com serra circular usando lâmina para alumínio (dentes finos, sentido inverso).',
      'Para dobras: chanfrar o miolo de polietileno com estilete no ponto de dobra, sem cortar o alumínio externo.',
      'Dobrar na dobradeira com pressão suave e uniforme — verificar ângulo de 90° com esquadro.',
      'Lixar as rebarbas dos cortes com lixa d\'água fina.',
      'Limpar todo o refugo de alumínio antes de continuar.',
    ],
    atencao: [
      'NUNCA cortar ACM sem EPI completo: óculos, luva de couro e protetor auricular.',
      'Lâmina para madeira provoca rebarbas e risco de acidente — usar exclusivamente lâmina para alumínio.',
      'Dobras sem chanfro adequado racham a pintura superficial do ACM — aparência comprometida.',
      'Conferir esquadro em todas as dobras — erro de ângulo é impossível de corrigir depois.',
    ],
    dicas: [
      'Usar régua guia parafusada à bancada para cortes longos — garante linha reta.',
      'Identificar frente e verso da chapa antes de cortar.',
      'Guardar sobras de ACM etiquetadas — úteis em pequenos reparos futuros.',
    ],
  },
  {
    id: 12, cat: 'acm', titulo: 'Fixação de fachada com perfil de alumínio',
    nivel: 'Avançado', tempo: '1 dia ou mais',
    materiais: ['Perfis de alumínio (omega, U ou L conforme projeto)', 'Parafusos para concreto ou drywall conforme substrato', 'Buchas adequadas ao substrato', 'Silicone neutro para vedação', 'Massa de vedação para juntas'],
    ferramentas: ['Furadeira de impacto / martelete', 'Nível laser de linha', 'Prumo', 'Chave de impacto ou parafusadeira', 'Serra de metal para cortar perfis', 'Cinto de segurança e EPI de altura se necessário'],
    passos: [
      'Visitar o local antes com projeto em mãos para planejar o layout de perfis.',
      'Projetar o nível laser na parede e marcar todos os pontos de fixação.',
      'Verificar o substrato: concreto exige martelete e bucha de concreto; drywall exige bucha específica.',
      'Perfurar todos os pontos antes de começar a fixar.',
      'Fixar os perfis horizontais primeiro (verificar nível).',
      'Fixar os perfis verticais (verificar perpendicularidade com esquadro e prumo).',
      'Testar a rigidez da estrutura antes de fixar as chapas.',
      'Fixar as chapas de ACM na estrutura de acordo com o projeto.',
      'Selar as juntas entre chapas com silicone neutro.',
      'Remover a película protetora das chapas apenas no final.',
    ],
    atencao: [
      'NUNCA iniciar fixação sem verificar a presença de fiação elétrica ou hidráulica na parede.',
      'Substrato fraco (reboco solto, tijolo sem impermeabilização) compromete toda a estrutura.',
      'Fachadas altas em locais ventosos exigem cálculo de carga — consultar engenheiro se necessário.',
      'Silicone neutro, nunca ácido — o silicone ácido corrói o alumínio.',
    ],
    dicas: [
      'Fotografar toda a estrutura antes de fechar com as chapas — registro de localização dos fixadores.',
      'Nível laser economiza horas de trabalho em relação ao nível de bolha em fachadas grandes.',
      'Deixar juntas de dilatação entre chapas (mínimo 3 mm) para acomodar expansão térmica.',
    ],
  },
  {
    id: 13, cat: 'acm', titulo: 'Montagem de caixa de luz em ACM',
    nivel: 'Médio', tempo: '4 a 8 horas',
    materiais: ['Chapas de ACM já cortadas e dobradas conforme projeto', 'Fita LED (cor e potência conforme especificação)', 'Fonte de alimentação para LED', 'Acrílico leitoso (face frontal translúcida)', 'Parafusos e suportes', 'Calha para passagem de fio'],
    ferramentas: ['Parafusadeira', 'Multímetro', 'Furadeira', 'Nível de bolha'],
    passos: [
      'Montar a carcaça de ACM (laterais, fundo e abas) parafusando ou rebitando.',
      'Pintar o interior da caixa com tinta branca para maximizar a reflexão da luz.',
      'Instalar as fitas LED no interior, espaçadas uniformemente para iluminação homogênea.',
      'Conectar as fitas à fonte de alimentação e testar antes de fechar.',
      'Verificar pontos quentes ou escuros — ajustar espaçamento se necessário.',
      'Fixar o acrílico leitoso na face frontal.',
      'Passar o cabo de alimentação por calha até o ponto elétrico.',
      'Fixar a caixa na parede ou estrutura com suportes adequados.',
      'Conectar à rede elétrica (somente profissional habilitado).',
      'Testar o funcionamento final e verificar uniformidade de iluminação.',
    ],
    atencao: [
      'A instalação elétrica deve ser feita por profissional com habilitação — nunca realizar sem qualificação.',
      'Espaçamento inadequado das fitas LED gera pontos escuros visíveis no acrílico.',
      'Fonte de alimentação subdimensionada superaquece — calcular a carga corretamente.',
      'Verificar se o acrílico é específico para face de caixa de luz (transmissão luminosa adequada).',
    ],
    dicas: [
      'Interior pintado de branco melhora muito a uniformidade da iluminação.',
      'Medir a intensidade luminosa com luxímetro (se disponível) para garantir homogeneidade.',
    ],
  },
  {
    id: 14, cat: 'acm', titulo: 'Letreiro plano em ACM',
    nivel: 'Médio', tempo: '2 a 4 horas',
    materiais: ['Chapa de ACM cortada nas dimensões do projeto', 'Adesivo impresso (se aplicável) ou ACM pintado na produção', 'Parafusos espaçadores (standoffs) para fixação com afastamento', 'Buchas e parafusos para o substrato'],
    ferramentas: ['Furadeira com broca para metal', 'Nível laser', 'Parafusadeira', 'Fita métrica'],
    passos: [
      'Conferir as dimensões da chapa de ACM cortada versus o projeto.',
      'Limpar a superfície do ACM com álcool isopropílico.',
      'Se houver adesivo sobre o ACM, aplicar conforme POP de adesivo em superfície plana.',
      'Marcar os pontos de fixação no substrato com nível laser.',
      'Perfurar os pontos de fixação.',
      'Instalar os espaçadores (standoffs) na parede.',
      'Fixar o painel nos espaçadores.',
      'Verificar o nível e prumo final.',
      'Remover a película protetora das chapas.',
    ],
    atencao: [
      'Espaçadores mal alinhados ficam visíveis e comprometem a estética — nível é essencial.',
      'Painéis grandes (acima de 5 kg) exigem fixação em elemento estrutural da parede, não apenas em reboco.',
    ],
    dicas: [
      'Espaçadores de mesmo tamanho garantem que o painel fique paralelo à parede.',
      'Fotografar o posicionamento antes de fixar definitivamente para aprovação do cliente.',
    ],
  },

  // ── LETRAS E LUMINOSOS ────────────────────────────────────────────────────
  {
    id: 15, cat: 'letras', titulo: 'Letra caixa com LED interno',
    nivel: 'Avançado', tempo: '4 a 8 horas por conjunto',
    materiais: ['Carcaça da letra caixa (ACM ou inox conforme projeto)', 'Face em acrílico colorido ou translúcido', 'Fita LED interna (cor conforme projeto)', 'Fonte de alimentação', 'Suportes de parede', 'Cabo e calha de passagem de fio'],
    ferramentas: ['Furadeira / martelete', 'Nível laser', 'Parafusadeira', 'Multímetro', 'Fita crepe'],
    passos: [
      'Conferir as letras recebidas da produção — dimensões, acabamento e encaixe da face acrílica.',
      'Testar o sistema de LED de cada letra individualmente antes de ir a campo.',
      'Planejar o layout no local: projetar nível laser e marcar posição de cada letra com fita crepe.',
      'Definir o caminho do cabeamento até a fonte e até o ponto elétrico.',
      'Fixar os suportes de cada letra na parede conforme o layout marcado.',
      'Passar o cabeamento pelos suportes e pela calha.',
      'Fixar cada letra nos respectivos suportes.',
      'Conectar o cabeamento à fonte de alimentação.',
      'Ligar a fonte e verificar o funcionamento de todas as letras.',
      'Verificar uniformidade de iluminação — substituir LEDs ou ajustar fitas se necessário.',
      'Fechar a calha de cabeamento e finalizar.',
    ],
    atencao: [
      'Instalação elétrica somente por profissional habilitado.',
      'Verificar a direção certa de cada letra antes de fixar — erro exige retirada e reposicionamento.',
      'Letras em altura requerem protocolo NR-35 — ver POP específico.',
      'Conferir a tensão da rede elétrica (110 V ou 220 V) antes de conectar a fonte.',
    ],
    dicas: [
      'Fotografar o layout de fita crepe aprovado pelo cliente antes de iniciar a perfuração.',
      'Numerar as letras nas embalagens conforme a ordem de instalação.',
      'Testar TODOS os LEDs antes de subir a uma altura — muito mais fácil consertar no chão.',
    ],
  },
  {
    id: 16, cat: 'letras', titulo: 'Letra caixa sem iluminação',
    nivel: 'Médio', tempo: '2 a 4 horas',
    materiais: ['Letras caixa em ACM, inox, PVC expandido ou MDF pintado', 'Suportes e parafusos', 'Buchas adequadas ao substrato', 'Selante se necessário'],
    ferramentas: ['Furadeira / martelete', 'Nível laser', 'Parafusadeira', 'Fita métrica', 'Fita crepe'],
    passos: [
      'Testar o layout no chão antes de subir — alinhar todas as letras na sequência correta.',
      'Projetar o nível laser no local de instalação.',
      'Marcar os pontos de fixação de cada letra com fita crepe.',
      'Perfurar todos os pontos.',
      'Fixar os suportes na parede.',
      'Encaixar e parafusar cada letra.',
      'Verificar nível e alinhamento de cada letra antes de apertar definitivamente.',
      'Inspecionar e remover as películas protetoras.',
    ],
    atencao: [
      'Letras pesadas (inox, ACM grande) exigem fixação em substrato resistente — não fixar em reboco sem reforço.',
      'Verificar se as letras foram entregues com película protetora — remover somente no final da instalação.',
    ],
    dicas: [
      'Marcar o centro de cada letra e o centro da parede para garantir alinhamento simétrico.',
      'Em conjuntos longos, começar pela letra central e trabalhar para os lados.',
    ],
  },
  {
    id: 17, cat: 'letras', titulo: 'Instalação de LED flex / neon',
    nivel: 'Médio', tempo: '2 a 3 horas',
    materiais: ['LED flex ou neon flex (verificar IP para uso externo)', 'Perfil de alumínio com difusor para LED flex (se aplicável)', 'Suportes e grampos de fixação', 'Fonte de alimentação', 'Controlador (se RGB ou com efeitos)', 'Calha de cabeamento'],
    ferramentas: ['Furadeira', 'Parafusadeira', 'Multímetro', 'Tesoura ou cortador específico para LED'],
    passos: [
      'Medir o percurso total do LED e planejar o cabeamento antes de iniciar.',
      'Testar todo o rolo de LED antes de cortar — verificar pontos apagados ou defeituosos.',
      'Cortar o LED apenas nos pontos indicados pelo fabricante (geralmente a cada 5 cm) — corte errado inutiliza o trecho.',
      'Fixar os suportes ou perfis ao longo do percurso.',
      'Encaixar o LED flex nos suportes.',
      'Conectar as emendas e conectores em sequência.',
      'Passar o cabeamento pela calha até a fonte.',
      'Conectar à fonte e testar o funcionamento completo.',
      'Verificar continuidade de cor e ausência de pontos escuros.',
    ],
    atencao: [
      'Cortar LED no lugar errado queima o trecho inteiro — sempre verificar os marcadores antes de cortar.',
      'LED flex não pode dobrar em ângulo superior a 90° sem suporte específico.',
      'Verificar grau de proteção IP do LED para uso externo — mínimo IP65 em área descoberta.',
      'Instalação elétrica somente por profissional habilitado.',
    ],
    dicas: [
      'Perfil de alumínio com difusor melhora a aparência da iluminação — elimina a visão direta dos pontos de LED.',
      'Temperatura de cor: 3000 K (quente) para ambientes comerciais acolhedores, 6500 K (frio) para ambientes técnicos ou modernos.',
    ],
  },
  {
    id: 18, cat: 'letras', titulo: 'Totem luminoso (base + estrutura)',
    nivel: 'Avançado', tempo: '1 a 2 dias',
    materiais: ['Estrutura metálica do totem (tubo quadrado ou redondo)', 'Painéis de ACM e acrílico', 'Sistema de LED interno', 'Chumbadores e base de concreto (se fixo ao chão)', 'Tinta anticorrosiva para a estrutura'],
    ferramentas: ['Furadeira de impacto / martelete', 'Chave de impacto', 'Nível laser e prumo', 'Betoneira ou balde para concreto (se base nova)', 'EPI de altura se necessário'],
    passos: [
      'Verificar o projeto estrutural aprovado — totens fixos ao chão podem exigir alvará municipal.',
      'Executar a base de concreto se necessário — aguardar cura mínima de 72 horas antes de continuar.',
      'Fixar a estrutura metálica na base com chumbadores.',
      'Montar os painéis de ACM sobre a estrutura.',
      'Instalar o sistema de LED interno.',
      'Instalar o acrílico na face luminosa.',
      'Passar o cabeamento e conectar à rede elétrica (somente habilitado).',
      'Testar e verificar uniformidade de iluminação.',
      'Remover películas protetoras e inspecionar o acabamento.',
    ],
    atencao: [
      'Totens em áreas públicas geralmente exigem aprovação da prefeitura — verificar com o cliente antes de iniciar.',
      'Estrutura sem tratamento anticorrosivo em ambiente externo deteriora em meses.',
      'Verificar estabilidade do totem contra vento — estruturas altas requerem cálculo de carga.',
      'Instalação elétrica somente por profissional habilitado.',
    ],
    dicas: [
      'Pintura anticorrosiva em duas demãos prolonga significativamente a vida útil da estrutura.',
      'Registrar o esquema de cabeamento interno em foto para facilitar manutenções futuras.',
    ],
  },
  {
    id: 19, cat: 'letras', titulo: 'Painel LED modular',
    nivel: 'Médio', tempo: '4 a 6 horas',
    materiais: ['Módulos LED (verificar tensão e passo de pixel conforme projeto)', 'Controlador de painel', 'Fontes de alimentação (calcular uma por seção de módulos)', 'Cabos de sinal e energia', 'Estrutura de suporte'],
    ferramentas: ['Parafusadeira', 'Multímetro', 'Notebook com software de configuração do controlador', 'Nível de bolha'],
    passos: [
      'Planejar a disposição dos módulos conforme o projeto (filas e colunas).',
      'Fixar os módulos na estrutura conectando os cabos de sinal em sequência (daisy chain).',
      'Conectar as fontes de alimentação — calcular 80% da capacidade máxima por fonte.',
      'Conectar o controlador ao computador ou receptor Wi-Fi.',
      'Configurar o controlador com a resolução correta do painel.',
      'Testar a imagem com conteúdo de calibração (linhas e cores sólidas).',
      'Ajustar módulos com defeito ou posicionamento incorreto.',
      'Instalar o conteúdo definitivo e verificar resultado final.',
    ],
    atencao: [
      'Erro na sequência dos cabos de sinal inverte ou embaralha a imagem — seguir o esquema do fabricante à risca.',
      'Fontes subdimensionadas causam piscadas e falhas — nunca usar acima de 80% da capacidade.',
      'Instalação elétrica somente por profissional habilitado.',
    ],
    dicas: [
      'Testar cada módulo individualmente antes de montar na estrutura.',
      'Guardar a configuração do controlador em backup digital — facilita a reconfiguração em caso de troca.',
    ],
  },

  // ── BANNERS E TENSIONADOS ─────────────────────────────────────────────────
  {
    id: 20, cat: 'banners', titulo: 'Montagem de roll-up',
    nivel: 'Básico', tempo: '10 a 15 minutos',
    materiais: ['Display roll-up completo (base + banner + haste)'],
    ferramentas: ['Nenhuma ferramenta necessária'],
    passos: [
      'Abrir a base do roll-up e estabilizá-la no chão.',
      'Retirar o banner do cartucho puxando suavemente pela alça superior.',
      'Encaixar as hastes telescópicas na sequência correta.',
      'Conectar a haste ao suporte superior do banner.',
      'Verificar se o banner está completamente esticado e sem vincos.',
      'Ajustar a tensão pelo mecanismo da base se necessário.',
      'Posicionar no local definitivo.',
    ],
    atencao: [
      'Nunca puxar o banner com força excessiva — a mola interna pode disparar e danificar o material.',
      'Verificar se o banner está inserido corretamente no trilho antes de recolher — forçar pode rasgar a borda.',
    ],
    dicas: [
      'Demonstrar o recolhimento correto para o cliente — ele precisa saber montar e desmontar.',
      'Armazenar roll-up em local protegido do sol quando não estiver em uso.',
    ],
  },
  {
    id: 21, cat: 'banners', titulo: 'Banner em lona com ilhós',
    nivel: 'Básico', tempo: '30 a 60 minutos',
    materiais: ['Banner impresso em lona (com ilhós já instalados na produção)', 'Abraçadeiras plásticas, cordas ou borrachas elásticas conforme o ponto de fixação'],
    ferramentas: ['Escada se necessário', 'Alicate', 'Nível de bolha para banners grandes e horizontais'],
    passos: [
      'Verificar se todos os ilhós estão bem fixados na lona — refixar se necessário antes de tensionar.',
      'Identificar os pontos de fixação (grades, postes, cercas ou parede).',
      'Fixar primeiro os cantos superiores.',
      'Tensionar os cantos inferiores garantindo que o banner ficou reto.',
      'Fixar os ilhós intermediários para distribuir a tensão uniformemente.',
      'Verificar o nível visual (para banners com texto horizontal).',
    ],
    atencao: [
      'Tensão excessiva com borrachas pode rasgar os ilhós — tensionar só o suficiente para eliminar dobras.',
      'Em locais com vento forte, usar mais pontos de fixação para reduzir a carga por ilhó.',
      'Nunca fixar banner em local onde possa cair sobre pessoas em caso de desprendimento.',
    ],
    dicas: [
      'Lona com reforço de borda raramente rasga nos ilhós — indicar ao cliente para pedidos futuros.',
      'Banners externos em ambientes com muito vento se beneficiam de cortes de alívio (frestas) na lona.',
    ],
  },
  {
    id: 22, cat: 'banners', titulo: 'Tecido tensionado em frame de alumínio (SEG)',
    nivel: 'Médio', tempo: '2 a 4 horas',
    materiais: ['Perfil de frame de alumínio SEG (com canal de silicone)', 'Tecido têxtil impresso com bead de silicone na borda', 'Parafusos e fixadores para montagem do frame'],
    ferramentas: ['Espátula de inserção de silicone (plástica)', 'Alicate de pressão', 'Nível de bolha', 'Cortador de tecido'],
    passos: [
      'Montar o frame de alumínio nas dimensões do projeto.',
      'Fixar o frame na parede ou estrutura de suporte com nível.',
      'Encaixar um lado do tecido no perfil SEG começando pela parte superior.',
      'Com espátula plástica, inserir o bead de silicone do tecido no canal do perfil — começar pelos lados maiores.',
      'Trabalhar em direção às extremidades para que o tecido fique centrado.',
      'Verificar se não há dobras ou tensão desigual — retirar e reinserir no ponto com problema.',
      'Finalizar encaixando os cantos (que exigem mais força).',
      'Inspecionar de frente para verificar tensão uniforme e ausência de rugas.',
    ],
    atencao: [
      'Tecido mal alinhado no início gera rugas impossíveis de corrigir sem retirar tudo.',
      'Encaixar os cantos por último — começar pelos cantos trava o tecido em posição errada.',
      'Espátula metálica rasga o tecido e danifica o perfil — usar sempre espátula plástica.',
    ],
    dicas: [
      'Umidade e calor relaxam o tecido — instalar em temperatura ambiente estável.',
      'Tecido com bead costurado é mais fácil de inserir do que com bead colado.',
    ],
  },
  {
    id: 23, cat: 'banners', titulo: 'Backwall de tecido (fundo fotográfico / evento)',
    nivel: 'Médio', tempo: '1 a 2 horas',
    materiais: ['Estrutura de tubo pop-up ou modular', 'Tecido tensionado impresso com velcro ou sistema de encaixe', 'Pesos de base para estabilidade (se uso externo)'],
    ferramentas: ['Chave de fenda ou Allen (dependendo do modelo da estrutura)', 'Fita métrica'],
    passos: [
      'Montar a estrutura de tubo seguindo as instruções do fabricante.',
      'Verificar estabilidade — a estrutura deve ficar firme antes de receber o tecido.',
      'Encaixar o tecido começando pela parte superior.',
      'Prender o tecido com velcro ou no sistema de fixação do modelo.',
      'Tensionar para baixo, eliminando rugas da parte superior para a inferior.',
      'Verificar a frente para confirmar posicionamento correto da imagem.',
      'Adicionar pesos na base para maior estabilidade se for uso externo.',
    ],
    atencao: [
      'Backwalls para eventos ao ar livre exigem lastro ou fixação adicional contra vento.',
      'Verificar que a imagem está orientada corretamente antes de tensionar — rotação de 180° exige desmontagem completa.',
    ],
    dicas: [
      'Treinar a montagem e desmontagem rápida antes de chegar ao evento — agiliza muito no dia.',
      'Fotografar a montagem correta para referência em usos futuros.',
    ],
  },

  // ── SINALIZAÇÃO ───────────────────────────────────────────────────────────
  {
    id: 24, cat: 'sinalizacao', titulo: 'Placa de identificação em PVC / acrílico',
    nivel: 'Básico', tempo: '30 a 60 minutos',
    materiais: ['Placa finalizada (PVC, acrílico ou similar)', 'Parafusos espaçadores ou fita adesiva dupla face de alta performance', 'Buchas e parafusos (se fixação parafusada)'],
    ferramentas: ['Furadeira (se parafuso)', 'Nível de bolha', 'Fita métrica', 'Parafusadeira'],
    passos: [
      'Definir o local exato de instalação com o cliente ou responsável pelo espaço.',
      'Marcar os pontos de fixação com nível de bolha.',
      'Para dupla face: aplicar nas bordas da placa e no centro — pressionar firmemente por 60 segundos.',
      'Para parafuso: fixar os espaçadores primeiro, depois encaixar a placa.',
      'Verificar o nível final.',
      'Remover a película protetora se for acrílico.',
    ],
    atencao: [
      'Dupla face em superfícies porosas (reboco, textura) não adere bem — usar parafuso nesses casos.',
      'Acrílico sem película de proteção durante a perfuração pode rachar — usar broca específica para acrílico em velocidade baixa.',
    ],
    dicas: [
      'Dupla face VHB (3M ou equivalente) aguenta muito bem em superfícies lisas e limpas.',
      'Espaçadores com parafuso conferem acabamento mais profissional do que a dupla face em placas nobres.',
    ],
  },
  {
    id: 25, cat: 'sinalizacao', titulo: 'Sinalização de segurança (NR-26)',
    nivel: 'Básico', tempo: '1 a 2 horas',
    materiais: ['Placas de sinalização conforme NR-26 (cores regulamentadas)', 'Fixadores conforme o local (parafusos, dupla face ou ilhós)'],
    ferramentas: ['Furadeira se necessário', 'Nível de bolha', 'Fita métrica'],
    passos: [
      'Verificar o layout aprovado pela CIPA ou responsável de segurança do cliente.',
      'Instalar placas na altura visual correta — padrão: centro da placa a 1,80 m do piso.',
      'Verificar que as placas não estão obstruídas por móveis, portas ou outros elementos.',
      'Instalar conforme sequência lógica de fluxo (entradas, saídas, pontos críticos).',
      'Fotografar a instalação final para registro e entrega ao cliente.',
    ],
    atencao: [
      'Placas NR-26 têm cores regulamentadas — não alterar cores mesmo a pedido do cliente.',
      'Sinalização de rota de fuga não pode ser obstruída em nenhuma circunstância.',
      'Guardar documentação de conformidade quando exigida pelo cliente ou órgão fiscalizador.',
    ],
    dicas: [
      'Verificar com o cliente se há requisito de fotoluminescência (brilha no escuro) antes de produzir.',
      'Registrar fotos do antes e depois para eventual auditoria de segurança do trabalho.',
    ],
  },
  {
    id: 26, cat: 'sinalizacao', titulo: 'Totem de sinalização em MDF / ACM',
    nivel: 'Médio', tempo: '3 a 5 horas',
    materiais: ['Corpo do totem (MDF pintado ou ACM) já produzido e acabado', 'Base e suporte de piso ou parede', 'Parafusos, buchas e fixadores'],
    ferramentas: ['Furadeira / martelete', 'Nível de bolha (dois eixos)', 'Parafusadeira', 'Esquadro'],
    passos: [
      'Verificar o acabamento e os adesivos do totem antes de ir a campo.',
      'Montar a base no local definitivo verificando nível e prumo.',
      'Encaixar o corpo do totem na base.',
      'Verificar a estabilidade — simular uma leve pressão lateral para testar.',
      'Fixar definitivamente com parafusos ou epóxi conforme o projeto.',
      'Remover as películas protetoras.',
    ],
    atencao: [
      'Totens de MDF em ambientes com umidade elevada deterioram rapidamente — verificar adequação do material antes de produzir.',
      'Base mal nivelada resulta em totem visualmente torto — verificar o nível em dois eixos (frente-trás e lateral).',
    ],
    dicas: [
      'Testar a estabilidade com uma pressão leve antes de finalizar — totem que balança precisa de reforço.',
      'Fotografar o totem instalado em ângulo que mostre o contexto do ambiente para portfólio.',
    ],
  },
  {
    id: 27, cat: 'sinalizacao', titulo: 'Piso tátil direcional e de alerta',
    nivel: 'Médio', tempo: '2 a 4 horas',
    materiais: ['Placas de piso tátil (direcional: linhas paralelas; alerta: bolinhas)', 'Adesivo de piso de alta performance ou argamassa colante conforme o tipo de piso', 'Primer se necessário'],
    ferramentas: ['Nível e régua', 'Rolo de pressão', 'Estilete e esquadro'],
    passos: [
      'Definir o percurso tátil conforme o projeto de acessibilidade aprovado.',
      'Limpar e preparar o piso no percurso definido.',
      'Aplicar primer se necessário para o tipo de piso.',
      'Marcar com giz de lado o alinhamento das placas.',
      'Aplicar as placas do início do percurso até o fim, verificando alinhamento constante.',
      'Pressionar com rolete em toda a superfície.',
      'Verificar aderência em todas as bordas — reforçar com selante se necessário.',
    ],
    atencao: [
      'O percurso tátil deve ser contínuo — descontinuidades comprometem a acessibilidade.',
      'Seguir a NBR 9050 para espaçamento correto — é norma de acessibilidade e não pode ser adaptada livremente.',
    ],
    dicas: [
      'Tátil em cor contrastante com o piso (amarelo em piso cinza) é mais efetivo para pessoas com baixa visão.',
      'Registrar o projeto de percurso com foto aérea para documentação de conformidade.',
    ],
  },

  // ── INSTALAÇÃO EM ALTURA ──────────────────────────────────────────────────
  {
    id: 28, cat: 'altura', titulo: 'Protocolo de segurança em altura (NR-35) — LEITURA OBRIGATÓRIA',
    nivel: 'Avançado', tempo: 'Leitura obrigatória antes de qualquer trabalho acima de 2 m',
    materiais: ['Capacete de proteção com jugular', 'Cinto de segurança tipo paraquedista (Classe III)', 'Trava-queda conectado ao cabo-guia', 'Mosquetões homologados', 'Calçado com sola antiderrapante'],
    ferramentas: ['Análise Preliminar de Risco (APR) — formulário obrigatório'],
    passos: [
      'Verificar todos os EPIs antes de iniciar — inspecionar visualmente cabos, mosquetões e trava-quedas.',
      'Não utilizar nenhum EPI com sinal de dano, desgaste ou com prazo de validade vencido.',
      'Preencher a APR com os riscos identificados no local antes de iniciar o trabalho.',
      'Delimitar a área abaixo do trabalho para impedir o trânsito de pessoas.',
      'Definir o ponto de ancoragem antes de subir — deve suportar 1.500 kgf conforme NR-35.',
      'Conectar o trava-queda ao ponto de ancoragem antes de sair do nível do chão.',
      'Durante todo o trabalho em altura, manter ao menos um ponto de ancoragem ativo.',
      'Nunca trabalhar em altura em condições de vento forte, chuva ou risco de raios.',
      'Comunicar imediatamente qualquer condição de risco ao responsável.',
      'Em caso de acidente: acionar o SAMU (192) imediatamente e não mover o acidentado sem orientação médica.',
    ],
    atencao: [
      'NENHUM prazo ou urgência justifica ignorar este protocolo.',
      'Somente colaboradores com treinamento NR-35 vigente podem trabalhar em altura.',
      'Guardar toda a documentação (APR, certificados NR-35) — pode ser exigida em fiscalização.',
      'Trabalho em altura acima de 2 metros sem EPI adequado é crime conforme a legislação trabalhista.',
    ],
    dicas: [
      'Renovar o treinamento NR-35 antes do vencimento — certificado vencido impede a execução do serviço.',
      'Fotografar os pontos de ancoragem e EPIs utilizados para registro em cada serviço.',
    ],
  },
  {
    id: 29, cat: 'altura', titulo: 'Instalação com uso de andaime',
    nivel: 'Avançado', tempo: 'Variável conforme o serviço',
    materiais: ['Andaime tubular montado por profissional habilitado e com placa de inspeção válida', 'EPIs completos conforme POP NR-35', 'Pranchões de madeira ou plataformas metálicas certificadas'],
    ferramentas: ['Ferramentas do serviço em execução', 'Corda para içamento de materiais'],
    passos: [
      'Verificar se o andaime foi montado por profissional e está com a placa de inspeção válida.',
      'Inspecionar a estabilidade antes de subir — balançar levemente para verificar a rigidez.',
      'Subir utilizando os degraus do andaime — nunca subir pela estrutura externa.',
      'Manter os três pontos de contato ao subir e descer (duas mãos + um pé ou dois pés + uma mão).',
      'Nunca se inclinar além das bordas — reposicionar o andaime se o alcance for insuficiente.',
      'Manter o piso do andaime livre de ferramentas e materiais desnecessários.',
      'Passar materiais e ferramentas por corda ou balde de içamento — nunca lançar.',
      'Ao término, descer com todo o material antes de desmontar o andaime.',
    ],
    atencao: [
      'Andaime em solo irregular exige nivelamento com parafusos de ajuste — nunca calçar com madeira solta.',
      'Verificar a carga máxima do andaime (normalmente 200 kg/m²) — não sobrecarregar com materiais pesados.',
      'Em andaimes próximos à rede elétrica, verificar distância mínima de segurança com a concessionária antes de montar.',
    ],
    dicas: [
      'Sinalizar o perímetro do andaime com fita zebrada para evitar acidentes com terceiros.',
      'Corda com balde de içamento elimina subidas e descidas desnecessárias — aumenta a produtividade.',
    ],
  },
  {
    id: 30, cat: 'altura', titulo: 'Instalação com balancim / rapel urbano',
    nivel: 'Avançado', tempo: 'Variável — somente por profissional com habilitação específica',
    materiais: ['Balancim motorizado ou manual homologado, OU equipamentos de rapel urbano certificados', 'Dois pontos de ancoragem independentes (principal e backup)', 'EPIs completos conforme POP NR-35', 'Rádio comunicador ou celular para contato com equipe em terra'],
    ferramentas: ['Ferramentas do serviço em execução', 'Sistema de içamento para materiais'],
    passos: [
      'Inspecionar todos os equipamentos — balancim, cabos, mosquetões e pontos de ancoragem.',
      'Testar o ponto de ancoragem com carga antes de subir.',
      'Para balancim: verificar motor, freio e nivelamento da plataforma em relação à fachada.',
      'Conectar sempre dois pontos de ancoragem independentes (principal + backup) antes de sair do chão.',
      'Manter comunicação constante com a equipe em terra durante toda a operação.',
      'Delimitar e sinalizar a área abaixo do balancim para impedir trânsito de pessoas.',
      'Em caso de pane no balancim: ativar o sistema de travamento e acionar o resgate — nunca tentar descer por meio improvisado.',
      'Nunca trabalhar com vento acima de 40 km/h.',
    ],
    atencao: [
      'Rapel urbano e balancim exigem habilitação específica além da NR-35 — verificar credenciais antes de autorizar a execução.',
      'NUNCA operar balancim ou fazer rapel sozinho — equipe em terra é obrigatória.',
      'Vento acima de 40 km/h: suspender imediatamente a operação.',
    ],
    dicas: [
      'Verificar a previsão do tempo para os dias do serviço — ventos inesperados são o maior risco em trabalho com balancim.',
      'Fotografar os dois pontos de ancoragem e a configuração dos equipamentos antes de subir para registro de segurança.',
    ],
  },

  // ── ACABAMENTO E PLOTAGEM ─────────────────────────────────────────────────
  {
    id: 31, cat: 'acabamento', titulo: 'Laminação fria de impressão',
    nivel: 'Básico', tempo: '30 a 60 minutos',
    materiais: ['Impressão finalizada e completamente seca', 'Laminado frio (brilho, fosco ou proteção UV conforme especificação)'],
    ferramentas: ['Laminadora fria (rolos de pressão)', 'Estilete e régua metálica'],
    passos: [
      'Verificar se a impressão está completamente seca — tinta úmida forma bolhas sob o laminado.',
      'Limpar os rolos da laminadora com pano seco.',
      'Ajustar a pressão da laminadora conforme a espessura do material.',
      'Inserir a impressão alinhada entre os rolos.',
      'Alinhar o início do laminado com a borda da impressão.',
      'Passar à velocidade constante e uniforme — sem parar no meio.',
      'Verificar a saída: inspecionar bolhas, vincos ou desalinhamentos.',
      'Cortar as bordas em excesso com régua e estilete.',
    ],
    atencao: [
      'Nunca laminar materiais úmidos — bolhas são inevitáveis e irreversíveis.',
      'Pressão excessiva cria marcas dos rolos na impressão.',
      'Temperatura ambiente abaixo de 18 °C pode reduzir a aderência do filme de laminação.',
    ],
    dicas: [
      'Passar o material em velocidade mais lenta em impressões de grande formato para melhor aderência.',
      'Laminação fosca esconde melhor as marcas de dedo e riscos superficiais — indicar ao cliente para peças de alto manuseio.',
    ],
  },
  {
    id: 32, cat: 'acabamento', titulo: 'Corte de vinil no plotter de recorte',
    nivel: 'Básico', tempo: 'Variável conforme quantidade',
    materiais: ['Rolo de vinil na cor especificada no projeto', 'Arquivo de arte vetorizado (.eps ou .ai com curvas corretas e sem fontes abertas)'],
    ferramentas: ['Plotter de recorte (ex.: Roland, Graphtec, Silhouette)', 'Software de controle do plotter'],
    passos: [
      'Verificar se o arquivo está em formato vetorial e com curvas corretas — sem fontes abertas.',
      'Definir o modo correto de corte no software (offset de lâmina conforme o tipo de vinil).',
      'Carregar o rolo de vinil no plotter verificando a largura e o alinhamento.',
      'Fazer um teste de corte em área pequena para verificar pressão e profundidade da lâmina.',
      'A lâmina deve cortar o vinil sem cortar o liner — ajustar a pressão se necessário.',
      'Iniciar o corte e acompanhar os primeiros metros.',
      'Após o corte, fazer o desbaste (remover o excesso de vinil fora do desenho).',
      'Aplicar o transfer sobre o vinil desbastado.',
      'Conferir a arte contra o arquivo antes de embalar.',
    ],
    atencao: [
      'Lâmina desgastada corta mal e danifica o liner — substituir regularmente (a cada 50 m² aproximadamente).',
      'Offset incorreto deixa cantos arredondados ou gera cortes duplos — calibrar antes de cortes de precisão.',
      'Vinil frio endurece e pode rachar ao ser descolado — deixar à temperatura ambiente por 30 minutos antes de usar.',
    ],
    dicas: [
      'Fazer sempre um teste de corte no início de cada bobina nova — a espessura pode variar entre lotes.',
      'Desbaste cuidadoso em fontes pequenas evita rasgos nas letras durante o transfer.',
    ],
  },
  {
    id: 33, cat: 'acabamento', titulo: 'Transfer e recorte eletrônico',
    nivel: 'Médio', tempo: '1 a 2 horas',
    materiais: ['Vinil recortado e desbastado', 'Papel transfer (baixa tack para vinil fino, alta tack para vinil grosso ou texturizado)', 'Rodo de aplicação'],
    ferramentas: ['Rodo de borracha ou feltro', 'Espátula plástica (para auxiliar em transfers delicados)', 'Estilete'],
    passos: [
      'Verificar se o vinil está completamente desbastado — resíduos entre letras causam erro de transfer.',
      'Escolher o transfer adequado: baixa tack para vinil fino, alta tack para vinil grosso.',
      'Aplicar o transfer sobre o vinil pressionando com rodo do centro para as bordas.',
      'Levantar o transfer lentamente verificando se todo o vinil veio junto.',
      'Se algum trecho ficar para trás, pressionar novamente e tentar com mais calma.',
      'Posicionar o conjunto (transfer + vinil) sobre a superfície de destino.',
      'Pressionar com rodo até aderência completa.',
      'Remover o transfer em ângulo de 45°, verificando se o vinil ficou na superfície.',
    ],
    atencao: [
      'Transfer de alta tack pode arrancar vinil fino — testar em sobra antes de usar na peça final.',
      'Remover o transfer muito rápido pode arrancar o vinil junto — puxar devagar e constante.',
      'Em fontes muito pequenas, segurar o vinil com espátula enquanto remove o transfer para evitar que ele levante.',
    ],
    dicas: [
      'Transfer de papel é mais fácil de posicionar do que transfer de plástico em peças grandes.',
      'Pressionar o transfer com rodo uma segunda vez após o posicionamento melhora a aderência antes de remover.',
    ],
  },
];

/* ── Helpers de POPs ────────────────────────────────────────────────────── */
function popEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function popCatLabel(id) {
  const c = POP_CATS.find(x => x.id === id);
  return c ? c.label : id;
}

function popNivelClasse(nivel) {
  const n = String(nivel || '').toLowerCase();
  if (n.startsWith('bás')) return 'basico';
  if (n.startsWith('méd')) return 'medio';
  return 'avancado';
}

// Texto pré-formatado para envio via WhatsApp Web (sem API).
function montarTextoPOP(pop) {
  const linhas = [];
  linhas.push(`*POP ${pop.id} — ${pop.titulo}*`);
  linhas.push(`📁 ${popCatLabel(pop.cat)}  ·  🎚 ${pop.nivel}  ·  ⏱ ${pop.tempo}`);
  linhas.push('');
  linhas.push('*🧰 Materiais:*');
  pop.materiais.forEach(m => linhas.push(`• ${m}`));
  linhas.push('');
  linhas.push('*🔧 Ferramentas:*');
  pop.ferramentas.forEach(f => linhas.push(`• ${f}`));
  linhas.push('');
  linhas.push('*📋 Passo a passo:*');
  pop.passos.forEach((p, i) => linhas.push(`${i + 1}. ${popPassoTexto(p)}`));
  linhas.push('');
  linhas.push('*⚠️ Pontos de atenção:*');
  pop.atencao.forEach(a => linhas.push(`• ${a}`));
  linhas.push('');
  linhas.push('*✅ Dicas de qualidade:*');
  pop.dicas.forEach(d => linhas.push(`• ${d}`));
  linhas.push('');
  linhas.push('— Impresilk · Manual de POPs');
  return linhas.join('\n');
}

function enviarPOPWhatsApp(pop, numero) {
  try { popRegistrarEnvio(pop.id, numero); } catch {}
  const txt = encodeURIComponent(montarTextoPOP(pop));
  const num = String(numero || '').replace(/\D/g, '');
  const url = num
    ? `https://wa.me/55${num}?text=${txt}`
    : `https://wa.me/?text=${txt}`;
  window.open(url, '_blank');
}

/* ── Itens 28-30: armazenamento de POPs personalizados + métricas ─────────
   Os 33 POPs base ficam no código (POPS). O admin pode criar/editar/publicar
   POPs adicionais, guardados em localStorage. A lista efetiva é a mescla das
   duas fontes (custom com mesmo id sobrescreve a base). */
const POP_LS_CUSTOM  = 'impresilk_pops_custom';
const POP_LS_METRICS = 'impresilk_pops_metrics';

function popLoadCustom() {
  try { return JSON.parse(localStorage.getItem(POP_LS_CUSTOM)) || []; } catch { return []; }
}
function popSaveCustom(arr) {
  try { localStorage.setItem(POP_LS_CUSTOM, JSON.stringify(arr)); } catch {}
}

// Lista mesclada base + personalizados.
function popsTodos() {
  const custom = popLoadCustom();
  const byId = {};
  POPS.forEach(p => { byId[p.id] = p; });
  custom.forEach(p => { byId[p.id] = Object.assign({}, byId[p.id] || {}, p); });
  return Object.keys(byId).map(k => byId[k]).sort((a, b) => a.id - b.id);
}
// Só publicados (esconde rascunhos) — usado nas telas de consulta/envio.
function popsPublicados() { return popsTodos().filter(p => !p.rascunho); }
function popById(id) { return popsTodos().find(p => p.id === +id) || null; }
function popProximoId() {
  const ids = popsTodos().map(p => p.id);
  return Math.max(999, ...ids) + 1;
}

// Passo pode ser string (base) ou {texto, foto} (custom com foto).
function popPassoTexto(p) { return (p && typeof p === 'object') ? (p.texto || '') : String(p || ''); }
function popPassoFoto(p)  { return (p && typeof p === 'object') ? (p.foto || '') : ''; }

/* ── Métricas de uso (item 30) ───────────────────────────────────────────── */
function popLoadMetrics() {
  try {
    const m = JSON.parse(localStorage.getItem(POP_LS_METRICS));
    return m && typeof m === 'object' ? Object.assign({ acessos: {}, envios: {}, catDuvidas: {} }, m) : { acessos: {}, envios: {}, catDuvidas: {} };
  } catch { return { acessos: {}, envios: {}, catDuvidas: {} }; }
}
function popSaveMetrics(m) { try { localStorage.setItem(POP_LS_METRICS, JSON.stringify(m)); } catch {} }
function popRegistrarAcesso(id) {
  const m = popLoadMetrics(); m.acessos[id] = (m.acessos[id] || 0) + 1; popSaveMetrics(m);
}
function popRegistrarEnvio(id, destino) {
  const m = popLoadMetrics();
  (m.envios[id] = m.envios[id] || []).push({ destino: String(destino || ''), quando: new Date().toISOString() });
  const pop = popById(id);
  if (pop) m.catDuvidas[pop.cat] = (m.catDuvidas[pop.cat] || 0) + 1;
  popSaveMetrics(m);
}

/* ── Estado local da aba POPs ───────────────────────────────────────────── */
const POP_STATE = { cat: 'todos', busca: '', abertos: {} };

function popsFiltrados() {
  const q = POP_STATE.busca.trim().toLowerCase();
  return popsPublicados().filter(p => {
    if (POP_STATE.cat !== 'todos' && p.cat !== POP_STATE.cat) return false;
    if (!q) return true;
    const alvo = [p.titulo, popCatLabel(p.cat), p.nivel,
      ...(p.materiais || []), ...(p.ferramentas || []),
      ...(p.passos || []).map(popPassoTexto), ...(p.atencao || []), ...(p.dicas || [])
    ].join(' ').toLowerCase();
    return alvo.includes(q);
  });
}

function popCardHTML(pop) {
  const aberto = !!POP_STATE.abertos[pop.id];
  const nc = popNivelClasse(pop.nivel);
  const detalhe = !aberto ? '' : `
    <div class="pop-detalhe">
      <div class="pop-bloco">
        <h4>🧰 Materiais</h4>
        <ul>${(pop.materiais || []).map(m => `<li>${popEsc(m)}</li>`).join('')}</ul>
      </div>
      <div class="pop-bloco">
        <h4>🔧 Ferramentas</h4>
        <ul>${(pop.ferramentas || []).map(f => `<li>${popEsc(f)}</li>`).join('')}</ul>
      </div>
      <div class="pop-bloco">
        <h4>📋 Passo a passo</h4>
        <ol>${(pop.passos || []).map(p => `<li>${popEsc(popPassoTexto(p))}${popPassoFoto(p) ? `<br><img class="pop-passo-foto" src="${popEsc(popPassoFoto(p))}" alt="foto do passo">` : ''}</li>`).join('')}</ol>
      </div>
      <div class="pop-bloco pop-atencao">
        <h4>⚠️ Pontos de atenção</h4>
        <ul>${(pop.atencao || []).map(a => `<li>${popEsc(a)}</li>`).join('')}</ul>
      </div>
      <div class="pop-bloco pop-dicas">
        <h4>✅ Dicas de qualidade</h4>
        <ul>${(pop.dicas || []).map(d => `<li>${popEsc(d)}</li>`).join('')}</ul>
      </div>
      <button class="btn-primary btn-sm pop-enviar" data-pop="${pop.id}">💬 Enviar este POP</button>
    </div>`;
  return `
    <div class="pop-card ${aberto ? 'aberto' : ''}" data-popcard="${pop.id}">
      <div class="pop-head" data-toggle="${pop.id}">
        <span class="pop-num">${pop.id}</span>
        <div class="pop-info">
          <p class="pop-titulo">${popEsc(pop.titulo)}</p>
          <p class="pop-meta">⏱ ${popEsc(pop.tempo)}</p>
        </div>
        <span class="pop-nivel st-${nc}">${popEsc(pop.nivel)}</span>
        <button class="btn-ghost btn-sm pop-enviar" data-pop="${pop.id}" title="Enviar via WhatsApp">💬</button>
        <span class="pop-chevron">${aberto ? '▲' : '▼'}</span>
      </div>
      ${detalhe}
    </div>`;
}

function renderPops() {
  const el = $('#panel-pops');
  if (!el) return;

  const chips = [{ id: 'todos', label: 'Todas', ico: '📚' }, ...POP_CATS]
    .map(c => `<button class="pop-chip ${POP_STATE.cat === c.id ? 'ativo' : ''}" data-cat="${c.id}">${c.ico} ${popEsc(c.label)}</button>`)
    .join('');

  const lista = popsFiltrados();

  // Agrupa por categoria (mantém tudo categorizado, rolável).
  let corpo = '';
  if (!lista.length) {
    corpo = emptyState('🔍', 'Nenhum POP encontrado', 'Tente outro termo ou categoria.');
  } else {
    const ordem = POP_CATS.map(c => c.id);
    ordem.forEach(catId => {
      const doCat = lista.filter(p => p.cat === catId);
      if (!doCat.length) return;
      const c = POP_CATS.find(x => x.id === catId);
      corpo += `
        <div class="pop-categoria">
          <h3 class="pop-cat-titulo">${c.ico} ${popEsc(c.label)} <span class="pop-cat-count">${doCat.length}</span></h3>
          ${doCat.map(popCardHTML).join('')}
        </div>`;
    });
  }

  const admin = popEhAdmin();
  el.innerHTML = `
    <div class="pops-topo">
      <div class="pops-cab">
        <h2>📚 Procedimentos Operacionais Padrão</h2>
        <span class="pops-total">${popsPublicados().length} POPs · ${POP_CATS.length} categorias</span>
        ${admin ? '<button class="btn-ghost btn-sm" id="pop-gerenciar" style="margin-left:auto">⚙️ Gerenciar</button>' : ''}
      </div>
      <input id="pop-busca" class="pop-busca" type="search" placeholder="🔍 Buscar POP (ex.: bolha, letra caixa, vidro…)" value="${popEsc(POP_STATE.busca)}">
      <div class="pop-chips">${chips}</div>
    </div>
    <div class="pops-lista">${corpo}</div>`;

  const ger = $('#pop-gerenciar');
  if (ger) ger.onclick = () => abrirGerenciadorPOPs();

  // Busca (mantém foco e cursor).
  const busca = $('#pop-busca');
  busca.oninput = () => {
    POP_STATE.busca = busca.value;
    renderPops();
    const b = $('#pop-busca');
    b.focus();
    b.setSelectionRange(b.value.length, b.value.length);
  };

  // Filtro por categoria.
  $$('.pop-chip').forEach(ch => {
    ch.onclick = () => { POP_STATE.cat = ch.dataset.cat; renderPops(); };
  });

  // Expandir / recolher card.
  $$('[data-toggle]').forEach(h => {
    h.onclick = (e) => {
      if (e.target.closest('.pop-enviar')) return; // não recolhe ao clicar em enviar
      const id = +h.dataset.toggle;
      const abrindo = !POP_STATE.abertos[id];
      POP_STATE.abertos[id] = abrindo;
      if (abrindo) { try { popRegistrarAcesso(id); } catch {} } // item 30: conta acesso
      renderPops();
    };
  });

  // Enviar POP via WhatsApp.
  $$('.pop-enviar').forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      const pop = popById(b.dataset.pop);
      if (pop) abrirEnvioPOP(pop);
    };
  });
}

// Admin? (usado para liberar o gerenciador de POPs)
function popEhAdmin() {
  try { return typeof STATE !== 'undefined' && STATE.user && STATE.user.papel === 'admin'; }
  catch { return false; }
}

// Seletor de contato para envio (usa contatos cadastrados em CFG, se houver).
function abrirEnvioPOP(pop) {
  let contatos = [];
  try {
    const cfg = (typeof STORE !== 'undefined' && STORE.getCFG) ? STORE.getCFG() : null;
    contatos = (cfg && Array.isArray(cfg.funcionarios)) ? cfg.funcionarios : [];
  } catch { contatos = []; }

  const opts = contatos
    .filter(c => c && c.numero)
    .map(c => `<button class="pop-contato" data-num="${popEsc(c.numero)}">👤 ${popEsc(c.nome || c.numero)}${c.departamento ? ` · ${popEsc(c.departamento)}` : ''}</button>`)
    .join('');

  const overlay = document.createElement('div');
  overlay.className = 'pop-envio-overlay';
  overlay.innerHTML = `
    <div class="pop-envio-box">
      <div class="pop-envio-head">
        <strong>💬 Enviar POP ${pop.id}</strong>
        <button class="modal-close" id="pop-envio-x">×</button>
      </div>
      <p class="pop-envio-sub">${popEsc(pop.titulo)}</p>
      ${opts ? `<div class="pop-contatos">${opts}</div>` : '<p class="text-muted">Nenhum contato cadastrado no Painel de Controle.</p>'}
      <div class="pop-envio-manual">
        <input id="pop-num-manual" type="tel" placeholder="ou digite o número (DDD + número)">
        <button class="btn-primary btn-sm" id="pop-env-manual">Enviar via WhatsApp</button>
      </div>
      <button class="btn-ghost w-100 mt-12" id="pop-env-sem">Abrir WhatsApp sem destinatário</button>
    </div>`;
  document.body.appendChild(overlay);

  const fechar = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });
  overlay.querySelector('#pop-envio-x').onclick = fechar;
  overlay.querySelectorAll('.pop-contato').forEach(b => {
    b.onclick = () => { enviarPOPWhatsApp(pop, b.dataset.num); fechar(); };
  });
  overlay.querySelector('#pop-env-manual').onclick = () => {
    const n = overlay.querySelector('#pop-num-manual').value;
    enviarPOPWhatsApp(pop, n); fechar();
  };
  overlay.querySelector('#pop-env-sem').onclick = () => { enviarPOPWhatsApp(pop, ''); fechar(); };
}

/* ── Item 25: enviar POP a partir do card da O.S (pré-filtrado por categoria) ──
   Deriva a categoria provável a partir do serviço/itens da O.S e abre um
   seletor já filtrado. O usuário ainda pode trocar de categoria ou buscar. */
const POP_CAT_KEYWORDS = {
  adesivos:      ['adesiv', 'vinil', 'vidro', 'jatead', 'recorte', 'parede', 'piso'],
  envelopamento: ['envelop', 'wrap', 'frota', 'veicul', 'carro', 'ônibus', 'onibus', 'van', 'moto'],
  acm:           ['acm', 'fachada', 'revestiment', 'alucobond', 'painel'],
  letras:        ['letra', 'caixa', 'luminos', 'led', 'neon', 'backlight', 'frontlight', 'channel'],
  banners:       ['banner', 'lona', 'tensionad', 'wind', 'faixa', 'backdrop'],
  sinalizacao:   ['sinaliz', 'placa', 'totem', 'pictograma', 'wayfind', 'evacua'],
  altura:        ['altura', 'andaime', 'rapel', 'cordas', 'plataforma', 'içament', 'icament'],
  acabamento:    ['acabament', 'plotage', 'plotagem', 'laminaç', 'lamina', 'corte', 'refile']
};

function popCategoriaSugerida(os) {
  if (!os) return null;
  const itens = (os.itens || []).map(i => i && i.descricao || '').join(' ');
  const alvo = `${os.servico || ''} ${itens}`.toLowerCase();
  if (!alvo.trim()) return null;
  let melhor = null, melhorScore = 0;
  for (const cat in POP_CAT_KEYWORDS) {
    let score = 0;
    POP_CAT_KEYWORDS[cat].forEach(kw => { if (alvo.includes(kw)) score++; });
    if (score > melhorScore) { melhorScore = score; melhor = cat; }
  }
  return melhor;
}

// Contatos da equipe da O.S têm prioridade no envio.
function popContatosDaOS(os) {
  let cfg = null;
  try { cfg = (typeof STORE !== 'undefined' && STORE.getCFG) ? STORE.getCFG() : null; } catch { cfg = null; }
  const funcs = (cfg && Array.isArray(cfg.funcionarios)) ? cfg.funcionarios.filter(c => c && c.numero) : [];
  const equipe = (os && os.equipe || []).map(n => String(n).toLowerCase());
  const naEquipe = funcs.filter(c => equipe.includes(String(c.nome || '').toLowerCase()));
  const resto = funcs.filter(c => !naEquipe.includes(c));
  return { naEquipe, resto };
}

function abrirSeletorPOPparaOS(os) {
  const catSugerida = popCategoriaSugerida(os);
  const estado = { cat: catSugerida || 'todos', busca: '' };

  const overlay = document.createElement('div');
  overlay.className = 'pop-envio-overlay';
  document.body.appendChild(overlay);
  const fechar = () => overlay.remove();

  function lista() {
    const q = estado.busca.trim().toLowerCase();
    return popsPublicados().filter(p => {
      if (estado.cat !== 'todos' && p.cat !== estado.cat) return false;
      if (!q) return true;
      const alvo = [p.titulo, popCatLabel(p.cat), p.nivel].join(' ').toLowerCase();
      return alvo.includes(q);
    });
  }

  function render() {
    const chips = [{ id: 'todos', label: 'Todas', ico: '📚' }, ...POP_CATS]
      .map(c => `<button class="pop-chip ${estado.cat === c.id ? 'ativo' : ''}" data-cat="${c.id}">${c.ico} ${popEsc(c.label)}</button>`)
      .join('');
    const itens = lista().map(p => {
      const nc = popNivelClasse(p.nivel);
      return `<button class="pop-os-item" data-pop="${p.id}">
        <span class="pop-num">${p.id}</span>
        <span class="pop-os-tit">${popEsc(p.titulo)}</span>
        <span class="pop-nivel st-${nc}">${popEsc(p.nivel)}</span>
      </button>`;
    }).join('') || '<p class="text-muted" style="padding:12px">Nenhum POP nesta categoria.</p>';

    overlay.innerHTML = `
      <div class="pop-envio-box pop-os-box">
        <div class="pop-envio-head">
          <strong>📚 Enviar POP — O.S ${popEsc(os.numero || '—')}</strong>
          <button class="modal-close" id="pop-os-x">×</button>
        </div>
        ${catSugerida ? `<p class="pop-os-sug">Sugestão: <strong>${popEsc(popCatLabel(catSugerida))}</strong> (pelo serviço da O.S)</p>` : ''}
        <input id="pop-os-busca" class="pop-busca" type="search" placeholder="🔍 Buscar POP…" value="${popEsc(estado.busca)}">
        <div class="pop-chips">${chips}</div>
        <div class="pop-os-lista">${itens}</div>
      </div>`;

    overlay.querySelector('#pop-os-x').onclick = fechar;
    const busca = overlay.querySelector('#pop-os-busca');
    busca.oninput = () => {
      estado.busca = busca.value; render();
      const b = overlay.querySelector('#pop-os-busca'); b.focus();
      b.setSelectionRange(b.value.length, b.value.length);
    };
    overlay.querySelectorAll('.pop-chip').forEach(ch => {
      ch.onclick = () => { estado.cat = ch.dataset.cat; render(); };
    });
    overlay.querySelectorAll('.pop-os-item').forEach(b => {
      b.onclick = () => {
        const pop = popById(b.dataset.pop);
        if (pop) { fechar(); abrirEnvioPOPparaOS(pop, os); }
      };
    });
  }

  overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });
  render();
}

// Igual ao abrirEnvioPOP, mas prioriza a equipe da O.S na lista de contatos.
function abrirEnvioPOPparaOS(pop, os) {
  const { naEquipe, resto } = popContatosDaOS(os);
  const linha = c => `<button class="pop-contato" data-num="${popEsc(c.numero)}">👤 ${popEsc(c.nome || c.numero)}${c.departamento ? ` · ${popEsc(c.departamento)}` : ''}</button>`;
  const blocoEquipe = naEquipe.length ? `<p class="pop-envio-grupo">Equipe da O.S</p>${naEquipe.map(linha).join('')}` : '';
  const blocoResto  = resto.length ? `<p class="pop-envio-grupo">Outros contatos</p>${resto.map(linha).join('')}` : '';
  const opts = blocoEquipe + blocoResto;

  const overlay = document.createElement('div');
  overlay.className = 'pop-envio-overlay';
  overlay.innerHTML = `
    <div class="pop-envio-box">
      <div class="pop-envio-head">
        <strong>💬 Enviar POP ${pop.id}</strong>
        <button class="modal-close" id="pop-envio-x">×</button>
      </div>
      <p class="pop-envio-sub">${popEsc(pop.titulo)}</p>
      ${opts ? `<div class="pop-contatos">${opts}</div>` : '<p class="text-muted">Nenhum contato cadastrado no Painel de Controle.</p>'}
      <div class="pop-envio-manual">
        <input id="pop-num-manual" type="tel" placeholder="ou digite o número (DDD + número)">
        <button class="btn-primary btn-sm" id="pop-env-manual">Enviar via WhatsApp</button>
      </div>
      <button class="btn-ghost w-100 mt-12" id="pop-env-sem">Abrir WhatsApp sem destinatário</button>
    </div>`;
  document.body.appendChild(overlay);

  const fechar = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });
  overlay.querySelector('#pop-envio-x').onclick = fechar;
  overlay.querySelectorAll('.pop-contato').forEach(b => {
    b.onclick = () => { enviarPOPWhatsApp(pop, b.dataset.num); fechar(); };
  });
  overlay.querySelector('#pop-env-manual').onclick = () => {
    enviarPOPWhatsApp(pop, overlay.querySelector('#pop-num-manual').value); fechar();
  };
  overlay.querySelector('#pop-env-sem').onclick = () => { enviarPOPWhatsApp(pop, ''); fechar(); };
}

/* ════════════════════════════════════════════════════════════════════════════
   ITENS 28-30 — Gerenciador de POPs (admin): CRUD, rascunho/publicar e métricas
   ════════════════════════════════════════════════════════════════════════════ */
const POP_NIVEIS = ['Básico', 'Médio', 'Avançado'];

function popEhCustom(id) { return popLoadCustom().some(p => p.id === +id); }
function popEhBase(id)   { return POPS.some(p => p.id === +id); }
function popUpsertCustom(pop) {
  const arr = popLoadCustom();
  const i = arr.findIndex(p => p.id === pop.id);
  if (i >= 0) arr[i] = pop; else arr.push(pop);
  popSaveCustom(arr);
}
function popRemoverCustom(id) { popSaveCustom(popLoadCustom().filter(p => p.id !== +id)); }
function linhas(txt) { return String(txt || '').split('\n').map(s => s.trim()).filter(Boolean); }

function abrirGerenciadorPOPs() {
  if (!popEhAdmin()) return;
  const overlay = document.createElement('div');
  overlay.className = 'pop-envio-overlay';
  document.body.appendChild(overlay);
  const fechar = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });
  overlay.addEventListener('click', e => {
    if (e.target && e.target.id === 'pop-met-reset') {
      if (confirm('Zerar todas as métricas de uso dos POPs?')) {
        popSaveMetrics({ acessos: {}, envios: {}, catDuvidas: {} }); render();
      }
    }
  });

  let view = 'lista';

  function render() {
    overlay.innerHTML = `
      <div class="pop-envio-box pop-ger-box">
        <div class="pop-envio-head">
          <strong>⚙️ Gerenciar POPs</strong>
          <button class="modal-close" id="pop-ger-x">×</button>
        </div>
        <div class="pop-ger-tabs">
          <button class="pop-ger-tab ${view === 'lista' ? 'ativo' : ''}" data-v="lista">📋 POPs</button>
          <button class="pop-ger-tab ${view === 'metricas' ? 'ativo' : ''}" data-v="metricas">📊 Métricas</button>
        </div>
        <div class="pop-ger-corpo">${view === 'lista' ? viewLista() : viewMetricas()}</div>
      </div>`;
    overlay.querySelector('#pop-ger-x').onclick = fechar;
    overlay.querySelectorAll('.pop-ger-tab').forEach(t => { t.onclick = () => { view = t.dataset.v; render(); }; });
    if (view === 'lista') wireLista();
  }

  function viewLista() {
    const todos = popsTodos();
    const linhasHtml = todos.map(p => {
      const nc = popNivelClasse(p.nivel);
      const tags = [];
      if (p.rascunho) tags.push('<span class="pop-tag-rasc">Rascunho</span>');
      if (popEhCustom(p.id) && !popEhBase(p.id)) tags.push('<span class="pop-tag-novo">Novo</span>');
      else if (popEhCustom(p.id)) tags.push('<span class="pop-tag-edit">Editado</span>');
      return `<div class="pop-ger-linha">
        <span class="pop-num">${p.id}</span>
        <div class="pop-ger-info">
          <p class="pop-ger-tit">${popEsc(p.titulo)} ${tags.join(' ')}</p>
          <p class="pop-ger-sub">${popEsc(popCatLabel(p.cat))} · <span class="pop-nivel st-${nc}">${popEsc(p.nivel)}</span></p>
        </div>
        <div class="pop-ger-acoes">
          ${p.rascunho ? `<button class="btn-ghost btn-sm" data-pub="${p.id}" title="Publicar">⬆️</button>` : (popEhCustom(p.id) ? `<button class="btn-ghost btn-sm" data-unpub="${p.id}" title="Voltar a rascunho">⬇️</button>` : '')}
          <button class="btn-ghost btn-sm" data-edit="${p.id}" title="Editar">✏️</button>
          ${popEhCustom(p.id) && !popEhBase(p.id) ? `<button class="btn-ghost btn-sm" data-del="${p.id}" title="Excluir">🗑</button>` : ''}
        </div>
      </div>`;
    }).join('');
    return `<button class="btn-primary btn-sm w-100" id="pop-novo">+ Novo POP</button>
      <div class="pop-ger-lista">${linhasHtml}</div>`;
  }

  function wireLista() {
    overlay.querySelector('#pop-novo').onclick = () => abrirEditorPOP(null, render);
    overlay.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => abrirEditorPOP(popById(b.dataset.edit), render));
    overlay.querySelectorAll('[data-pub]').forEach(b => b.onclick = () => {
      const p = Object.assign({}, popById(b.dataset.pub)); p.rascunho = false; popUpsertCustom(p); render();
      if (typeof toast === 'function') toast('POP publicado', 'success');
    });
    overlay.querySelectorAll('[data-unpub]').forEach(b => b.onclick = () => {
      const p = Object.assign({}, popById(b.dataset.unpub)); p.rascunho = true; popUpsertCustom(p); render();
    });
    overlay.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (confirm('Excluir este POP personalizado?')) { popRemoverCustom(b.dataset.del); render(); }
    });
  }

  function viewMetricas() {
    const m = popLoadMetrics();
    const acessos = Object.keys(m.acessos).map(id => ({ id: +id, n: m.acessos[id], pop: popById(id) }))
      .filter(x => x.pop).sort((a, b) => b.n - a.n).slice(0, 10);
    const rankAcessos = acessos.length ? acessos.map((x, i) => `
      <div class="pop-met-linha"><span class="pop-met-pos">${i + 1}º</span>
        <span class="pop-met-tit">${popEsc(x.pop.titulo)}</span>
        <span class="pop-met-num">${x.n}</span></div>`).join('')
      : '<p class="text-muted" style="padding:8px">Sem acessos registrados ainda.</p>';

    let envios = [];
    Object.keys(m.envios).forEach(id => (m.envios[id] || []).forEach(e => {
      const pop = popById(id); if (pop) envios.push({ pop, destino: e.destino, quando: e.quando });
    }));
    envios.sort((a, b) => (b.quando || '').localeCompare(a.quando || ''));
    const totalEnvios = envios.length;
    const ultimos = envios.slice(0, 12).map(e => {
      const d = e.quando ? new Date(e.quando) : null;
      const data = d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
      return `<div class="pop-met-linha">
        <span class="pop-met-tit">${popEsc(e.pop.titulo)}</span>
        <span class="pop-met-dest">${e.destino ? '📱 ' + popEsc(e.destino) : 'sem destino'}</span>
        <span class="pop-met-num">${data}</span></div>`;
    }).join('') || '<p class="text-muted" style="padding:8px">Nenhum envio registrado ainda.</p>';

    const cats = Object.keys(m.catDuvidas).map(cat => ({ cat, n: m.catDuvidas[cat] })).sort((a, b) => b.n - a.n);
    const maxCat = cats.reduce((mx, c) => Math.max(mx, c.n), 0) || 1;
    const barras = cats.length ? cats.map(c => {
      const meta = POP_CATS.find(x => x.id === c.cat);
      return `<div class="pop-met-bar">
        <span class="pop-met-barlab">${meta ? meta.ico : ''} ${popEsc(meta ? meta.label : c.cat)}</span>
        <span class="pop-met-bartrack"><span class="pop-met-barfill" style="width:${Math.round(c.n / maxCat * 100)}%"></span></span>
        <span class="pop-met-num">${c.n}</span></div>`;
    }).join('') : '<p class="text-muted" style="padding:8px">Sem dados de categoria ainda.</p>';

    return `
      <div class="pop-met-bloco"><h4>🔥 POPs mais acessados</h4>${rankAcessos}</div>
      <div class="pop-met-bloco"><h4>📤 Quem recebeu (${totalEnvios} envio${totalEnvios === 1 ? '' : 's'})</h4>${ultimos}</div>
      <div class="pop-met-bloco"><h4>❓ Categorias com mais dúvidas</h4>${barras}</div>
      <button class="btn-ghost btn-sm w-100 mt-12" id="pop-met-reset">Zerar métricas</button>`;
  }

  render();
}

/* Editor de um POP (item 29): cria/edita, passos dinâmicos com foto, rascunho. */
function abrirEditorPOP(popOrig, onSalvo) {
  const base = popOrig ? JSON.parse(JSON.stringify(popOrig)) : {
    id: popProximoId(), cat: POP_CATS[0].id, titulo: '', nivel: 'Básico', tempo: '',
    materiais: [], ferramentas: [], passos: [], atencao: [], dicas: [], rascunho: true
  };
  base.passos = (base.passos || []).map(p => ({ texto: popPassoTexto(p), foto: popPassoFoto(p) }));

  const overlay = document.createElement('div');
  overlay.className = 'pop-envio-overlay';
  document.body.appendChild(overlay);
  const fechar = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });

  function passosHTML() {
    return base.passos.map((p, i) => `
      <div class="pop-ed-passo" data-pi="${i}">
        <span class="pop-num">${i + 1}</span>
        <textarea class="pop-ed-passo-txt" data-pi="${i}" rows="2" placeholder="Descreva o passo…">${popEsc(p.texto)}</textarea>
        <div class="pop-ed-passo-foto">
          ${p.foto ? `<img src="${popEsc(p.foto)}" alt="foto"><button class="btn-ghost btn-sm" data-rmfoto="${i}" title="Remover foto">✕</button>` : `<label class="btn-ghost btn-sm">📷<input type="file" accept="image/*" data-foto="${i}" hidden></label>`}
          <button class="btn-ghost btn-sm" data-rmpasso="${i}" title="Remover passo">🗑</button>
        </div>
      </div>`).join('');
  }

  function coletaCampos() {
    base.titulo = overlay.querySelector('#ed-titulo').value.trim();
    base.cat = overlay.querySelector('#ed-cat').value;
    base.nivel = overlay.querySelector('#ed-nivel').value;
    base.tempo = overlay.querySelector('#ed-tempo').value.trim();
    base.materiais = linhas(overlay.querySelector('#ed-materiais').value);
    base.ferramentas = linhas(overlay.querySelector('#ed-ferramentas').value);
    base.atencao = linhas(overlay.querySelector('#ed-atencao').value);
    base.dicas = linhas(overlay.querySelector('#ed-dicas').value);
    base.rascunho = overlay.querySelector('#ed-rascunho').checked;
    overlay.querySelectorAll('.pop-ed-passo-txt').forEach(t => {
      const i = +t.dataset.pi; if (base.passos[i]) base.passos[i].texto = t.value;
    });
  }

  function render() {
    const catOpts = POP_CATS.map(c => `<option value="${c.id}" ${base.cat === c.id ? 'selected' : ''}>${popEsc(c.label)}</option>`).join('');
    const nivOpts = POP_NIVEIS.map(n => `<option ${base.nivel === n ? 'selected' : ''}>${n}</option>`).join('');
    overlay.innerHTML = `
      <div class="pop-envio-box pop-ed-box">
        <div class="pop-envio-head">
          <strong>${popOrig ? '✏️ Editar' : '➕ Novo'} POP ${base.id}</strong>
          <button class="modal-close" id="pop-ed-x">×</button>
        </div>
        <div class="pop-ed-corpo">
          <label class="pop-ed-lbl">Título</label>
          <input id="ed-titulo" value="${popEsc(base.titulo)}" placeholder="Ex.: Aplicação de adesivo em vidro">
          <div class="pop-ed-row">
            <div><label class="pop-ed-lbl">Categoria</label><select id="ed-cat">${catOpts}</select></div>
            <div><label class="pop-ed-lbl">Nível</label><select id="ed-nivel">${nivOpts}</select></div>
            <div><label class="pop-ed-lbl">Tempo</label><input id="ed-tempo" value="${popEsc(base.tempo)}" placeholder="30 a 60 min"></div>
          </div>
          <label class="pop-ed-lbl">Materiais (um por linha)</label>
          <textarea id="ed-materiais" rows="3">${popEsc((base.materiais || []).join('\n'))}</textarea>
          <label class="pop-ed-lbl">Ferramentas (uma por linha)</label>
          <textarea id="ed-ferramentas" rows="3">${popEsc((base.ferramentas || []).join('\n'))}</textarea>
          <label class="pop-ed-lbl">Passo a passo</label>
          <div class="pop-ed-passos">${passosHTML()}</div>
          <button class="btn-ghost btn-sm" id="ed-add-passo">+ Adicionar passo</button>
          <label class="pop-ed-lbl">Pontos de atenção (um por linha)</label>
          <textarea id="ed-atencao" rows="2">${popEsc((base.atencao || []).join('\n'))}</textarea>
          <label class="pop-ed-lbl">Dicas de qualidade (uma por linha)</label>
          <textarea id="ed-dicas" rows="2">${popEsc((base.dicas || []).join('\n'))}</textarea>
          <label class="pop-ed-check"><input type="checkbox" id="ed-rascunho" ${base.rascunho ? 'checked' : ''}> Salvar como rascunho (não aparece para a equipe)</label>
        </div>
        <div class="pop-ed-foot">
          <button class="btn-ghost" id="ed-cancelar">Cancelar</button>
          <button class="btn-primary" id="ed-salvar">Salvar POP</button>
        </div>
      </div>`;

    overlay.querySelector('#pop-ed-x').onclick = fechar;
    overlay.querySelector('#ed-cancelar').onclick = fechar;
    overlay.querySelector('#ed-add-passo').onclick = () => { coletaCampos(); base.passos.push({ texto: '', foto: '' }); render(); };
    overlay.querySelectorAll('[data-rmpasso]').forEach(b => b.onclick = () => { coletaCampos(); base.passos.splice(+b.dataset.rmpasso, 1); render(); });
    overlay.querySelectorAll('[data-rmfoto]').forEach(b => b.onclick = () => { coletaCampos(); base.passos[+b.dataset.rmfoto].foto = ''; render(); });
    overlay.querySelectorAll('[data-foto]').forEach(inp => inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const i = +inp.dataset.foto;
      const reader = new FileReader();
      reader.onload = () => { coletaCampos(); base.passos[i].foto = reader.result; render(); };
      reader.readAsDataURL(f);
    });
    overlay.querySelector('#ed-salvar').onclick = () => {
      coletaCampos();
      if (!base.titulo) { if (typeof toast === 'function') toast('Dê um título ao POP', 'warn'); return; }
      base.passos = base.passos.filter(p => (p.texto && p.texto.trim()) || p.foto);
      popUpsertCustom(JSON.parse(JSON.stringify(base)));
      fechar();
      if (typeof toast === 'function') toast(base.rascunho ? 'Rascunho salvo' : 'POP publicado', 'success');
      if (typeof onSalvo === 'function') onSalvo();
      if (typeof renderPops === 'function' && typeof STATE !== 'undefined' && STATE.activeTab === 'pops') renderPops();
    };
  }

  render();
}
